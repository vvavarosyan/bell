#!/bin/bash
# Install / start Bell's local Crawl4AI scraping engine (free, JS-capable).
# Double-click to run. Safe to re-run. No terminal knowledge needed.
# Crawl4AI needs Python 3.10+; this finds the newest Python on your Mac.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
SRV="$DIR/Portal/server/enrichment/local/crawl4ai_server.py"
VENV="$HOME/.bell-crawl4ai"
PORT="${BELL_CRAWL4AI_PORT:-11235}"
PLIST="$HOME/Library/LaunchAgents/com.bell-qa.crawl4ai.plist"

echo "================================================"
echo "   Bell · Crawl4AI scraping engine — installer"
echo "================================================"
echo

if [ ! -f "$SRV" ]; then
  echo "X Could not find the engine script at:"
  echo "    $SRV"
  read -p "Press Enter to close..."; exit 1
fi

# --- Find a Python 3.10+ interpreter (system python3 is often too old) ---------
find_python() {
  CANDS="python3.13 python3.12 python3.11 python3.10 python3 python"
  for d in /opt/homebrew/bin /usr/local/bin /Library/Frameworks/Python.framework/Versions/*/bin; do
    for v in 3.13 3.12 3.11 3.10; do
      [ -x "$d/python$v" ] && CANDS="$CANDS $d/python$v"
    done
  done
  for c in $CANDS; do
    p="$(command -v "$c" 2>/dev/null || true)"
    [ -z "$p" ] && { [ -x "$c" ] && p="$c"; }
    [ -z "$p" ] && continue
    if "$p" -c 'import sys; raise SystemExit(0 if sys.version_info[:2] >= (3,10) else 1)' 2>/dev/null; then
      echo "$p"; return 0
    fi
  done
  return 1
}

PY="$(find_python || true)"
if [ -z "$PY" ]; then
  echo "X  Crawl4AI needs Python 3.10 or newer."
  echo "   The Python on this Mac is too old:  $(python3 --version 2>&1)"
  echo
  echo "   Fix (about 2 minutes, no terminal):"
  echo "     1) Open  https://www.python.org/downloads/macos/"
  echo "     2) Download the latest Python 3.12 installer and double-click the .pkg"
  echo "     3) Click through it, then double-click THIS file again."
  echo "        (It will detect the new Python automatically.)"
  echo
  read -p "Press Enter to close..."; exit 1
fi
echo "> Using $("$PY" --version 2>&1)  ($PY)"

echo "> Creating a clean isolated environment ($VENV)..."
rm -rf "$VENV"
"$PY" -m venv "$VENV" || { echo "X Could not create the environment."; read -p "Press Enter to close..."; exit 1; }
"$VENV/bin/pip" install --upgrade pip >/dev/null 2>&1

echo "> Installing crawl4ai (the first time can take a few minutes)..."
if ! "$VENV/bin/pip" install -U crawl4ai 2> "$VENV/pip.err"; then
  echo "X crawl4ai failed to install. Last lines:"
  tail -n 18 "$VENV/pip.err" 2>/dev/null | sed 's/^/    /'
  read -p "Press Enter to close..."; exit 1
fi

echo "> Installing the headless browser crawl4ai needs..."
"$VENV/bin/python" -m playwright install chromium >/dev/null 2>&1 \
  || "$VENV/bin/crawl4ai-setup" >/dev/null 2>&1 || true

echo "> Verifying crawl4ai imports..."
if ! "$VENV/bin/python" -c "import crawl4ai; print('   crawl4ai', getattr(crawl4ai,'__version__','?'))"; then
  echo "X crawl4ai installed but failed to import. Details:"
  "$VENV/bin/python" -c "import crawl4ai" 2>&1 | tail -n 18 | sed 's/^/    /'
  read -p "Press Enter to close..."; exit 1
fi

echo "> Installing the always-on background service..."
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.bell-qa.crawl4ai</string>
  <key>ProgramArguments</key>
  <array>
    <string>$VENV/bin/python</string>
    <string>$SRV</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>BELL_CRAWL4AI_PORT</key><string>$PORT</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$VENV/server.log</string>
  <key>StandardErrorPath</key><string>$VENV/server.err</string>
</dict>
</plist>
PL

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST" 2>/dev/null || true

echo "> Waiting for the engine to come up..."
ok=""
for i in $(seq 1 15); do
  sleep 2
  if curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"ok": *true'; then ok=1; break; fi
done

echo
if [ -n "$ok" ]; then
  echo "OK  Crawl4AI engine is running on http://127.0.0.1:$PORT"
  echo "    Bell's harvester will now use it automatically for JS-heavy sites."
  echo "    Tip: double-click 'Test Crawl4AI Engine.command' to confirm anytime."
else
  echo "!!  Not healthy yet. The engine reports:"
  curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null | sed 's/^/      /'
  echo
  echo "    (Bell keeps harvesting with its built-in renderer meanwhile.)"
  echo "    Log: $VENV/server.err"
fi
echo
read -p "Press Enter to close..."
