#!/bin/bash
# Bell Data Intelligence — Run Qatar Knowledge Scan
#
# Teaches Bell about Qatar from official government sources — the Foreign Ministry,
# International Media Office, Council of Ministers, Shura Council (political system,
# ministries, state structure, key people) AND Al Meezan, Qatar's authoritative
# legal portal (the Constitution, laws, decree-laws and decisions, English + Arabic).
# It also extracts the laws, ministries and officials each page mentions, and
# detects what CHANGED since the last run. Bella can then answer Qatar questions —
# including specific laws — with citations to the real source.
#
# Plain web fetch — NO browser, no Firecrawl. The governance sources take a few
# minutes; Al Meezan walks its law archive in resumable chunks (~10 min per run —
# just double-click again to continue where it left off; it says "cursor N" when
# there is more, or "full archive walked" when done). Safe to re-run any time.
# Publishes to the live site at the end.
#
# NOTE: the first time (and after any Bell update), double-click
# "Open Bell.qa Portal.command" ONCE before this so the database upgrade
# (the knowledge tables + per-source settings) is applied.

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
