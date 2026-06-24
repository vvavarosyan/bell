#!/bin/bash
# Bell Data Intelligence — Install the ALWAYS-ON Continuous Enrichment Engine
# ----------------------------------------------------------------------------
# Double-click ONCE. This runs the local engines (Website Finder + Harvester +
# Network Mapper) CONTINUOUSLY, 24/7, while your Mac is on — not just at night.
# It starts automatically at login, restarts itself if it ever crashes
# (KeepAlive), and uses `caffeinate` to keep the Mac awake while it works.
#
# It's resumable: it always picks the most-incomplete companies next, so it
# clears the backlog and then keeps maintaining the database as new companies
# arrive. Everything is local + $0 (no Apify/Firecrawl).
#
# Note: a closed lid on battery can still suspend the Mac. For true 24/7, keep it
# plugged in (and optionally lid-open or with "prevent sleep" on power adapter).
# To stop it: double-click "Uninstall Always-On Engine.command".

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/continuous_sweep.js"
LOG_DIR="$SCRIPT_DIR/Operations/run_logs"
PLIST_DIR="$HOME/Library/LaunchAgents"
LABEL="com.bell-qa.continuous-engine"
PLIST_FILE="$PLIST_DIR/$LABEL.plist"
OLD_NIGHTLY="$PLIST_DIR/com.bell-qa.harvest-sweep.plist"

echo "=========================================================="
echo "   Bell — Always-On Continuous Enrichment Engine"
echo "=========================================================="
echo

if [ ! -f "$SCRIPT" ]; then
  echo "ERROR: Can't find the engine script at:"
  echo "  $SCRIPT"
  echo "Pull the latest code first (Push/refresh), then re-run."
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

# Stop the OLD nightly job so they don't both sweep the same frontier.
if [ -f "$OLD_NIGHTLY" ]; then
  echo "Disabling the old nightly harvest (the always-on engine supersedes it)..."
  launchctl unload "$OLD_NIGHTLY" 2>/dev/null || true
fi

printf "Node.js:  %s\n" "$NODE_BIN"
printf "Engine:   %s\n" "$SCRIPT"
printf "Log:      %s/continuous_engine.log\n\n" "$LOG_DIR"

# Reload if already installed.
if [ -f "$PLIST_FILE" ]; then
  echo "Refreshing existing engine schedule..."
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
fi

# RunAtLoad=true → starts now + at every login.  KeepAlive=true → auto-restart if
# it crashes or is killed.  caffeinate -i → keep the Mac awake while it runs.
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
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>20</integer>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/continuous_engine.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/continuous_engine-error.log</string>
</dict>
</plist>
PLIST_EOF

launchctl load "$PLIST_FILE"

echo
echo "DONE — the engine is now running and will keep running 24/7."
echo
echo "  Watch it work:   tail -f \"$LOG_DIR/continuous_engine.log\""
echo "  Live status:     Portal → Companies → engine status card"
echo "  Turn it off:     double-click 'Uninstall Always-On Engine.command'"
echo
read -r -p "Press Enter to close this window..." _
