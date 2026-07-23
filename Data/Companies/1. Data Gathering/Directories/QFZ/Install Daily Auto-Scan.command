#!/bin/bash
# Bell.qa Qatar — Daily Auto-Scan Installer
# Double-click this file to schedule the QFZ scraper to run once a day.
# Re-run any time to update the schedule (e.g. after editing schedule.config).

set -e

# This script lives in the project folder, so its directory IS the project root.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRAPER="$SCRIPT_DIR/scrape_qfz.js"
CONFIG="$SCRIPT_DIR/schedule.config"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.bell-qa.qfz-scraper.plist"
LABEL="com.bell-qa.qfz-scraper"

echo "=========================================================="
echo "   Bell.qa Qatar — Daily Auto-Scan Installer"
echo "=========================================================="
echo

# 1. Verify scraper is present next to this installer
if [ ! -f "$SCRAPER" ]; then
  echo "ERROR: Can't find scrape_qfz.js next to this installer."
  echo "Expected: $SCRAPER"
  echo
  echo "Keep this .command file in the same folder as scrape_qfz.js."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# 2. Locate Node.js
NODE_BIN=""
for candidate in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
    break
  fi
done

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is not installed (or not in a standard location)."
  echo
  echo "Install it from:  https://nodejs.org   (download the LTS .pkg)"
  echo "Then double-click this installer again."
  read -r -p "Press Enter to close..." _
  exit 1
fi

# 3. Read time from schedule.config (default 09:00)
HOUR=9
MIN=0
if [ -f "$CONFIG" ]; then
  TIME_LINE=$(grep -E '^[[:space:]]*time[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*time[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  if [ -n "$TIME_LINE" ]; then
    if [[ "$TIME_LINE" =~ ^([0-9]{1,2}):([0-9]{2})$ ]]; then
      HOUR=$((10#${BASH_REMATCH[1]}))
      MIN=$((10#${BASH_REMATCH[2]}))
    else
      echo "WARNING: schedule.config time='$TIME_LINE' is not in HH:MM format."
      echo "         Falling back to default 09:00."
      echo
    fi
  fi
fi

if (( HOUR < 0 || HOUR > 23 || MIN < 0 || MIN > 59 )); then
  echo "ERROR: schedule.config has an invalid time. Use HH:MM (24-hour), e.g. 09:00"
  read -r -p "Press Enter to close..." _
  exit 1
fi

printf "Node.js:    %s\n" "$NODE_BIN"
printf "Scraper:    %s\n" "$SCRAPER"
printf "Daily time: %02d:%02d (local)\n" "$HOUR" "$MIN"
echo

# 4. Unload any prior version of the job
mkdir -p "$PLIST_DIR"
mkdir -p "$SCRIPT_DIR/scans"

if [ -f "$PLIST_FILE" ]; then
  echo "Removing previous schedule..."
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
fi

# 5. Write the new LaunchAgent plist
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

# 6. Load the schedule
launchctl load "$PLIST_FILE"

printf "\nDONE. The scraper will run every day at %02d:%02d.\n\n" "$HOUR" "$MIN"
echo "  Output folder:  $SCRIPT_DIR/scans/qfz/"
echo "  Latest file:    $SCRIPT_DIR/scans/qfz/qfz_companies_latest.json"
echo "  Schedule log:   $SCRIPT_DIR/scans/scheduler.log"
echo
echo "To run on demand:     double-click  'Run Scan Now.command'"
echo "To change the time:   open schedule.config in TextEdit, edit, save,"
echo "                      then double-click this installer again."
echo "To turn it off:       double-click  'Uninstall Daily Auto-Scan.command'"
echo
read -r -p "Press Enter to close this window..." _
