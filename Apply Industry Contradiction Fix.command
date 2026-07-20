#!/bin/bash
# APPLY — correct companies whose NAME clearly contradicts their tagged industry
# (barbershop→Banking, dry-cleaner→Oil&Gas). Sets the right industry from the
# name, keeps the old value in extra_fields.industry_corrected (audit/reversible),
# and rescores each company. Run "Preview Industry Contradiction Fix.command"
# first to see exactly what will change.
#
# Data stays on this Mac; it goes live on the next push (ask Claude, or run
# "Push Changes.command"). Double-click to run (seconds).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi

cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/fix_industry_contradictions.js --apply

echo
read -r -p "Press Enter to close this window... "
