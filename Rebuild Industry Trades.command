#!/bin/bash
# Bell Data Intelligence — Rebuild Industry Trades
# (1) Builds the curated trade vocabulary: keeps the meaningful recurring trades,
#     drops the thousands of one-off / typo'd categories, merges broad-duplicates.
# (2) Shows a PREVIEW of re-deriving every company's industries.
# (3) On YES, applies it.
# After it finishes: Push Changes (deploy both envs) + run your sync.

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
echo "=========================================================="
echo "   Bell — Rebuild Industry Trades  (step 1: build trade list)"
echo "=========================================================="
echo
"$NODE_BIN" "$SERVER_DIR/scripts/build_trade_vocabulary.js" || { echo "Build failed."; read -r -p "Press Enter to close..." _; exit 1; }

echo
echo "----------------------------------------------------------"
echo "   step 2: PREVIEW the re-derive (nothing changes yet)"
echo "----------------------------------------------------------"
"$NODE_BIN" "$SERVER_DIR/scripts/backfill_industry.js"

echo
read -r -p "Apply these industries now? Type YES to write, anything else to cancel: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Cancelled — the trade list was rebuilt but no companies were changed."
  read -r -p "Press Enter to close..." _; exit 0
fi
echo
"$NODE_BIN" "$SERVER_DIR/scripts/backfill_industry.js" --apply
echo
echo "Done. Now: (1) Push Changes to deploy the new trade list to both envs,"
echo "then (2) run your sync to mirror the industries to production."
read -r -p "Press Enter to close this window..." _
