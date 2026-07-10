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
# Logs live OUTSIDE the workspace: macOS privacy protection can stop a launchd
# background job from writing into ~/Desktop, which made the engine die silently
# with an empty log (diagnosed 2026-07-09). ~/Library/Logs is always writable.
LOG_DIR="$HOME/Library/Logs/bell-qa"
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

# Stop any existing copy. `bootout` is the modern replacement for `unload`
# (load/unload are deprecated and can fail silently on recent macOS).
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl unload "$PLIST_FILE" 2>/dev/null || true

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
    <!-- NO WorkingDirectory on the Desktop. launchd chdir()s before exec, and a
         background job is denied access to ~/Desktop, so it failed with
         EX_CONFIG (78) and retried forever without ever running node
         (diagnosed 2026-07-09). The engine needs no cwd: its config comes from
         environment variables and its imports resolve from the script path. -->
    <key>WorkingDirectory</key>
    <string>$HOME</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>20</integer>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/continuous_engine.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/continuous_engine-error.log</string>
</dict>
</plist>
PLIST_EOF

# Start it. Prefer the modern bootstrap/kickstart pair; fall back to `load` on
# older macOS. `set -e` is relaxed here so we can REPORT a failure instead of
# exiting silently (the old script claimed "DONE" even when nothing started).
set +e
launchctl bootstrap "gui/$UID" "$PLIST_FILE" 2>/dev/null || launchctl load -w "$PLIST_FILE" 2>/dev/null
launchctl kickstart -k "gui/$UID/$LABEL" 2>/dev/null
set -e

echo "Starting… (verifying the engine actually came up)"
sleep 6

STATUS="$(launchctl print "gui/$UID/$LABEL" 2>/dev/null)"
EXIT_CODE="$(printf '%s' "$STATUS" | grep -E 'last exit (code|status)' | head -1 | tr -dc '0-9')"
RUNNING_PID="$(printf '%s' "$STATUS" | grep -E '^\s*pid = ' | head -1 | tr -dc '0-9')"

echo
if [ -n "$RUNNING_PID" ]; then
  echo "✓ RUNNING — the engine is up (pid $RUNNING_PID) and will restart itself 24/7."
  echo
  echo "  Confirm:  Portal → Local Engines — the status turns green within ~1 minute."
elif [ "$EXIT_CODE" = "78" ]; then
  echo "✗ launchd could not configure the job (EX_CONFIG 78) — it never ran the engine."
  echo "  This means a path in the job is off-limits to background jobs."
  echo "  Run 'Check Engine Service.command' and send the output to Claude."
elif [ -n "$EXIT_CODE" ] && [ "$EXIT_CODE" != "0" ]; then
  echo "✗ The engine started and immediately exited (last exit code $EXIT_CODE)."
  echo "  Look at:  $LOG_DIR/continuous_engine-error.log"
  echo
  echo "  If that log shows a PERMISSION error reading the engine file, macOS is"
  echo "  blocking background access to your Desktop folder. Fix it once:"
  echo "     System Settings → Privacy & Security → Full Disk Access → '+'"
  echo "     press Cmd+Shift+G, paste:  $NODE_BIN"
  echo "     enable it, then re-run this installer."
else
  echo "⚠ Could not confirm the engine is running."
  echo "  Run 'Check Engine Service.command' and send the output to Claude."
  echo "  Meanwhile use 'Start Engine (foreground).command' (always works)."
fi

echo
echo "  Logs:            $LOG_DIR/continuous_engine.log"
echo "  Turn it off:     double-click 'Uninstall Always-On Engine.command'"
echo
read -r -p "Press Enter to close this window..." _
