#!/bin/bash
# Bell Data Intelligence — Start the enrichment engine in THIS window.
#
# Use this when the background service won't start (dashboard stuck on
# "Stopped (no recent heartbeat)"). A normal Terminal window always has the
# file access a launchd background job may be denied, so this always works.
#
#   • Leave this window OPEN — the engine runs while it's open.
#   • Close the window (or press Ctrl-C) to stop it.
#   • It is fully resumable: it always picks up where it left off.
#   • It respects Pause/Resume on the Portal's "Local Engines" tab.
#
# The Mac is kept awake with `caffeinate` while this runs.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/continuous_sweep.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi
if [ ! -r "$SCRIPT" ]; then
  echo "ERROR: cannot read $SCRIPT"; read -r -p "Press Enter to close..." _; exit 1
fi

echo "=========================================================="
echo "  Bell — Enrichment Engine (running in this window)"
echo "=========================================================="
echo "  Keep this window open. Ctrl-C or close it to stop."
echo "  Watch the Portal → Local Engines tab: within ~1 minute"
echo "  the status should turn green (heartbeat)."
echo

cd "$SERVER_DIR"
exec /usr/bin/caffeinate -i "$NODE_BIN" "$SCRIPT"
