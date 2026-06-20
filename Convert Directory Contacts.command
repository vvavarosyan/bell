#!/bin/bash
# Bell Data Intelligence — Convert Directory Contacts
# Turns directory listing fields (QCCI) that are currently loose text into proper
# records: Fax / Mobile become tagged phone contacts, and Contact Person / Owner
# become people linked to the company (with a position). Shows a PREVIEW first,
# then type YES to apply. After applying, run your sync to push to live.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/backfill_source_contacts.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "=========================================================="
echo "   Bell — Convert Directory Contacts (PREVIEW first)"
echo "=========================================================="
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"
echo
echo "----------------------------------------------------------"
read -r -p "Create these phone contacts + people now? Type YES to apply: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Cancelled — nothing was changed."; read -r -p "Press Enter to close..." _; exit 0
fi
echo
"$NODE_BIN" "$SCRIPT" --apply
echo
echo "Done. Now run your sync to production so the new contacts + people mirror to live."
read -r -p "Press Enter to close this window..." _
