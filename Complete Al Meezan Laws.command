#!/bin/bash
# Bell Data Intelligence — Complete the Al Meezan law archive
#
# Learns Qatar's ENTIRE Al Meezan legal portal (Constitution, laws, decree-laws,
# decisions — English + Arabic) in one go: it loops the resumable law-walk until
# the whole archive is learned, extracts the laws each page mentions, and
# publishes to the live site. ~45 minutes, plain fetch (no browser). Resumable —
# close the window any time and re-run; it continues where it left off.
#
# ⚠ Do NOT run this at the same time as "Run Qatar Knowledge Scan.command" — both
# walk the same law list and would race. One at a time.
#
# NOTE: run "Open Bell.qa Portal.command" once first (so the database + code are
# up to date) if you haven't already today.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_almeezan_complete.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
