#!/bin/bash
# Bell Data Intelligence — Run Nightly Harvest Now (10-minute test)
# Double-click to run the harvest sweep right now, in this window, for up to 10
# minutes, so you can confirm it works (DB connection, finding, harvesting). The
# real scheduled job runs the full ~6.5h budget overnight. Close this window any
# time to stop early.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/nightly_sweep.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "Running a 10-minute harvest test… (close the window to stop early)"
echo
cd "$SERVER_DIR"
BELL_NIGHTLY_MAX_MS=600000 "$NODE_BIN" "$SCRIPT"

echo
echo "Test finished. If you saw rounds with '+N found / +N harvested', it's working."
read -r -p "Press Enter to close this window..." _
