#!/bin/bash
# Bell Data Intelligence — Preview Tender Matching (#72, read-only)
#
# Dry-run proof of the tender→industry matcher on your REAL local tender data.
# Shows match coverage per source, how each match was made, what stayed
# unmatched (so Claude can extend the mapper), and the exact opportunity
# signals that would be generated today. NOTHING is changed or written.
# Safe to run any time — including while Enrich Tender Details is running.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/preview_tender_matching.js"

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
