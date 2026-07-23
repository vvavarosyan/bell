#!/bin/bash
# Bell.qa Qatar QSTP — Daily Auto-Scan Installer
# Double-click to schedule the QSTP scraper to run once a day.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRAPER="$SCRIPT_DIR/scrape_qstp.js"
CONFIG="$SCRIPT_DIR/schedule.config"
PKG_JSON="$SCRIPT_DIR/package.json"
NODE_MOD="$SCRIPT_DIR/node_modules"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.bell-qa.qstp-scraper.plist"
LABEL="com.bell-qa.qstp-scraper"

echo "=========================================================="
echo "   Bell.qa Qatar QSTP — Daily Auto-Scan Installer"
echo "=========================================================="
echo

# 1. Verify scraper is co-located
if [ ! -f "$SCRAPER" ]; then
  echo "ERROR: Can't find scrape_qstp.js next to this installer."
  read -r -p "Press Enter to close..." _; exit 1
fi

# 2. Find Node
NODE_BIN=""
for candidate in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
    break
  fi
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is not installed."
  echo "Install from https://nodejs.org and double-click this installer again."
  read -r -p "Press Enter to close..." _; exit 1
fi
echo "Node.js:    $NODE_BIN"

# 3. Install scraper deps (axios + cheerio) if not present
NPM_BIN="$(dirname "$NODE_BIN")/npm"
if [ ! -d "$NODE_MOD" ] || [ ! -d "$NODE_MOD/axios" ] || [ ! -d "$NODE_MOD/cheerio" ]; then
  echo "Installing scraper dependencies (axios, cheerio) ..."
  cd "$SCRIPT_DIR"
  if [ -x "$NPM_BIN" ]; then
    "$NPM_BIN" install --no-audit --no-fund --silent
  else
    npm install --no-audit --no-fund --silent
  fi
  echo "  done."
else
  echo "Dependencies already installed at .node_modules"
fi

# 4. Read time from schedule.config (default 09:00)
HOUR=9
MIN=0
if [ -f "$CONFIG" ]; then
  TIME_LINE=$(grep -E '^[[:space:]]*time[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*time[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  if [[ "$TIME_LINE" =~ ^([0-9]{1,2}):([0-9]{2})$ ]]; then
    HOUR=$((10#${BASH_REMATCH[1]}))
    MIN=$((10#${BASH_REMATCH[2]}))
  fi
fi
if (( HOUR < 0 || HOUR > 23 || MIN < 0 || MIN > 59 )); then
  echo "ERROR: schedule.config time out of range. Use HH:MM (24-hour)."
  read -r -p "Press Enter to close..." _; exit 1
fi

printf "Scraper:    %s\n" "$SCRAPER"
printf "Daily time: %02d:%02d (local)\n\n" "$HOUR" "$MIN"

# 5. Unload + write plist + load
mkdir -p "$PLIST_DIR" "$SCRIPT_DIR/scans"
if [ -f "$PLIST_FILE" ]; then
  echo "Removing previous schedule..."
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
fi
cat > "$PLIST_FILE" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$SCRAPER</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$SCRIPT_DIR</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MIN</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$SCRIPT_DIR/scans/scheduler.log</string>
    <key>StandardErrorPath</key>
    <string>$SCRIPT_DIR/scans/scheduler-error.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST_EOF
launchctl load "$PLIST_FILE"

printf "DONE. Scraper will run every day at %02d:%02d.\n\n" "$HOUR" "$MIN"
echo "To run on demand:    double-click  'Run Scan Now.command'"
echo "To change the time:  edit schedule.config, then re-run this installer"
echo "To turn it off:      double-click  'Uninstall Daily Auto-Scan.command'"
echo
read -r -p "Press Enter to close..." _
