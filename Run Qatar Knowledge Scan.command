#!/bin/bash
# Bell Data Intelligence — Run Qatar Knowledge Scan
#
# Teaches Bell about Qatar from official government sources (Foreign Ministry,
# International Media Office, Council of Ministers, Shura Council to start) —
# the political system, ministries, state structure and key people — and detects
# what CHANGED since the last run. Bella can then answer Qatar questions with
# citations to the real source.
#
# Plain web fetch — NO browser, no Firecrawl. A few minutes. Safe to re-run (it
# updates changed pages and flags them). Publishes to the live site at the end.
#
# NOTE: the first time, double-click "Open Bell.qa Portal.command" once BEFORE
# this so the database upgrade (the knowledge tables) is applied.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_knowledge.js"

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
