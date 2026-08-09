#!/bin/bash
# Bell Data Intelligence — Remove rows the live site shows that Bell has deleted
#
# ⚠️ THIS CHANGES THE LIVE SITE. Run "Find Production Orphans.command" first and
# read what it lists. This step queues those exact rows for removal, and the next
# data push takes them off app.bell.qa.
#
# What it removes: rows Bell itself already deleted — contacts found to belong to
# a different company, employment links Bell withdrew, people Bell removed. The
# deletion was supposed to travel up with the data and did not, so the live site
# has kept showing them.
#
# It removes NOTHING that Bell still holds. Every id is checked against Bell's own
# database first: if Bell still has the row, it is left alone.
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
echo "This will remove rows from the LIVE site (app.bell.qa)."
echo "Only rows Bell has already deleted. Nothing Bell still holds is touched."
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
