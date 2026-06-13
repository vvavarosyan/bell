#!/bin/bash
# Bell Data Intelligence — Install Nightly Harvest Sweep
# Double-click ONCE to schedule the local engines (Website Finder + Harvester)
# to run automatically every night at midnight. Re-run any time to refresh.
#
# The job works in chunks from midnight until a ~6.5h time budget, then stops
# cleanly and resumes the next night — so the backlog clears over several
# nights. The Mac must be awake/plugged in overnight (the job uses `caffeinate`
# to prevent idle sleep while it runs, but a closed lid on battery can still
# suspend it). To stop it: double-click "Uninstall Nightly Harvest.command".

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/nightly_sweep.js"
LOG_DIR="$SCRIPT_DIR/Operations/run_logs"
PLIST_DIR="$HOME/Library/LaunchAgents"
LABEL="com.bell-qa.harvest-sweep"
PLIST_FILE="$PLIST_DIR/$LABEL.plist"

# Schedule (24h local). Change HARVEST_HOUR/MIN here if you want another time.
HOUR=0
MIN=0

echo "=========================================================="
echo "   Bell Data Intelligence — Nightly Harvest Installer"
echo "=========================================================="
echo

if [ ! -f "$SCRIPT" ]; then
  echo "ERROR: Can't find the nightly script at:"
  echo "  $SCRIPT"
  echo "Pull the latest code first, then re-run."
  read -r -p "Press Enter to close..." _; exit 1
fi

# Locate Node.js + caffeinate.
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found. Install from https://nodejs.org and retry."
  read -r -p "Press Enter to close..." _; exit 1
fi
CAFFEINATE="/usr/bin/caffeinate"

mkdir -p "$PLIST_DIR" "$LOG_DIR"

printf "Node.js:     %s\n" "$NODE_BIN"
printf "Script:      %s\n" "$SCRIPT"
printf "Daily time:  %02d:%02d (local)\n" "$HOUR" "$MIN"
printf "Log:         %s/nightly_harvest.log\n\n" "$LOG_DIR"

# Unload any previous version.
if [ -f "$PLIST_FILE" ]; then
  echo "Removing previous schedule..."
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
fi

# Write the LaunchAgent. caffeinate -i keeps the Mac awake while the job runs.
cat > "$PLIST_FILE" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$CAFFEINATE</string>
        <string>-i</string>
        <string>$NODE_BIN</string>
        <string>$SCRIPT</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$SERVER_DIR</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MIN</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/nightly_harvest.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/nightly_harvest-error.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST_EOF

launchctl load "$PLIST_FILE"

printf "\nDONE. The nightly harvest will run every day at %02d:%02d.\n\n" "$HOUR" "$MIN"
echo "  Watch progress:  $LOG_DIR/nightly_harvest.log"
echo "  Run a test now:  launchctl start $LABEL   (or just wait for midnight)"
echo "  Turn it off:     double-click 'Uninstall Nightly Harvest.command'"
echo
read -r -p "Press Enter to close this window..." _
