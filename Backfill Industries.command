#!/bin/bash
# Bell Data Intelligence — Backfill Industries
# Fills the `industry` field for companies that have none, by inferring a
# canonical industry from the company name, LinkedIn data, the source-directory
# categories (QCCI/QSTP/QFZ) and any website text — so the Industry filter in
# the portal actually covers the database. It NEVER overwrites an existing
# industry, and leaves a company blank when nothing matches confidently.
#
# It first shows a PREVIEW (how many it would fill + the distribution). You then
# type YES to apply. After applying, run your sync to push the changes to live.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/backfill_industry.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "=========================================================="
echo "   Bell — Backfill Industries (PREVIEW first, nothing changes)"
echo "=========================================================="
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"
echo
echo "----------------------------------------------------------"
read -r -p "Apply these industries now? Type YES to write, anything else to cancel: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Cancelled — nothing was changed."; read -r -p "Press Enter to close..." _; exit 0
fi
echo
"$NODE_BIN" "$SCRIPT" --apply
echo
echo "Done. Now run your sync to production (a normal push) so the new"
echo "industries mirror to live."
read -r -p "Press Enter to close this window..." _
