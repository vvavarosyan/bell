#!/bin/bash
# Bell Data Intelligence — Tender Phantom Repair (APPLY — deletes phantoms)
#
# Deletes the phantom tenders listed by "Preview Tender Phantom Repair.command"
# (rows whose ref exists only embedded inside another tender's title — split
# artifacts of the old parser). Writes sync tombstones and removes the same
# rows from the live site, so local and prod stay an exact mirror.
#
# Run the PREVIEW first and eyeball the list. Safe to re-run; rows healed by a
# re-scan are never touched.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
PHANTOM_APPLY=1 "$NODE_BIN" "$SERVER_DIR/scripts/repair_tender_phantoms.js"

echo
read -r -p "Press Enter to close this window..." _
