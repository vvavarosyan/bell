#!/bin/bash
# Bell Data Intelligence — Check Tender Detail (Monaqasat health)
#
# Read-only sanity check. Prints how many tenders actually have activity codes,
# contact, contract and description captured — plus a few of the newest enriched
# tenders with their codes so you can compare against monaqasat.mof.gov.qa.
# Nothing is changed. Reads the same local database the scans write to.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/check_tender_detail.js"

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
