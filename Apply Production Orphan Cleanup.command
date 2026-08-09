#!/bin/bash
# Bell Data Intelligence — Remove rows the live site shows that Bell has deleted
#
# ⚠️ THIS CHANGES THE LIVE SITE. Run "Find Production Orphans.command" first and
# read what it lists. This step queues those exact rows for removal, and the next
# data push takes them off app.bell.qa.
#
# What it removes: rows Bell itself already deleted whose removal never travelled
# up to the live site. The contacts, technology records and knowledge sources were
# cleared on 2026-08-09; what remains is 10,026 employment links.
#
# It removes NOTHING that Bell still holds. Every id is checked against Bell's own
# database first: if Bell still has the row, it is left alone.
#
# The 10,026 employment links are now included. They were held back until it could
# be proven they were not created on the live site: every one of their ids is below
# the highest id Bell has ever issued, and inside the range Bell's own counter has
# used, so Bell created them and Bell deleted them. None is in the range the live
# site uses for its own rows.
#
# ONE THING IS STILL LEFT ALONE: rows the live site CREATED itself (research run
# from bell.qa). Those are never removed — they are meant to travel down to Bell,
# not be deleted. They are reported separately on screen.
#
# A couple of minutes, then a push.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo
echo "This removes about 10,026 employment links from the LIVE site (app.bell.qa)."
echo
echo "They were left over when duplicate companies were merged: Bell removed them,"
echo "the removal never travelled up, and the live site kept them. It has been"
echo "checked that the live site did not create any of them itself."
echo
echo "Nothing Bell still holds is touched."
echo
read -r -p "Type  yes  to continue: " ANSWER
if [ "$ANSWER" != "yes" ]; then echo "Cancelled — nothing changed."; read -r -p "Press Enter to close..." _; exit 0; fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SERVER_DIR/scripts/find_prod_orphans.js" --apply

echo
echo "Now publishing the removals to the live site…"
"$NODE_BIN" -e "import('$SERVER_DIR/sync/push.js').then(async (m) => { const r = await m.runPush({}); console.log('Removed from the live site:', JSON.stringify(r.deletions || {})); console.log('Errors:', (r.errors||[]).length); process.exit(0); })"

echo
read -r -p "Press Enter to close this window..." _
