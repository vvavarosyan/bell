#!/bin/bash
# Install / start Bell's local Crawl4AI scraping engine (free, JS-capable).
# Double-click to run. Safe to re-run. No terminal knowledge needed.
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
  echo "✗ Could not find the engine script at:"
  echo "    $SRV"
  echo "  Make sure this file stays inside your Bell project folder."
  read -p "Press Enter to close…"; exit 1
fi

PY="$(command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "✗ python3 is not installed on this Mac."
  echo "  Install it from https://www.python.org/downloads/  (or run: xcode-select --install)"
  echo "  then double-click this again."
  read -p "Press Enter to close…"; exit 1
fi
echo "▸ Using $("$PY" --version 2>&1)"

echo "▸ Creating an isolated environment ($VENV)…"
"$PY" -m venv "$VENV" || { echo "✗ Could not create the environment."; read -p "Press Enter to close…"; exit 1; }

echo "▸ Installing crawl4ai — the first time can take a few minutes…"
"$VENV/bin/pip" install --quiet --upgrade pip
if ! "$VENV/bin/pip" install --quiet -U crawl4ai; then
  echo "✗ crawl4ai failed to install (check your internet connection) — try again later."
  read -p "Press Enter to close…"; exit 1
fi

echo "▸ Installing the headless browser crawl4ai needs…"
"$VENV/bin/python" -m playwright install chromium >/dev/null 2>&1 \
  || "$VENV/bin/crawl4ai-setup" >/dev/null 2>&1 || true

echo "▸ Installing the always-on background service…"
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

echo "▸ Waiting for the engine to come up…"
ok=""
for i in $(seq 1 12); do
  sleep 2
  if curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"ok": *true'; then ok=1; break; fi
done

echo
if [ -n "$ok" ]; then
  echo "✓ Crawl4AI engine is running on http://127.0.0.1:$PORT"
  echo "  Bell's harvester will now use it automatically for JS-heavy sites."
else
  echo "⚠ The engine hasn't reported healthy yet — it may still be finishing the"
  echo "  first browser download. Log: $VENV/server.err"
  echo "  Bell keeps harvesting with its built-in renderer meanwhile — nothing is broken."
fi
echo
read -p "Press Enter to close…"
