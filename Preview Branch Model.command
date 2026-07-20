#!/bin/bash
# PREVIEW the branch model — shows how many empty facility "shells" would be folded
# into their real parent company (e.g. DOC Medical Center's 4 branches → the one DOC
# company). Changes NOTHING. Safe to run any time.
#
# It also writes the full list to a file at the workspace root:
#   "Branch Model — Preview.tsv"  (open it in Numbers/Excel to eyeball every group).
#
# When you're happy with the numbers, run "Apply Branch Model.command".
#
# Double-click to run.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi

cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/branch_model.js

echo
read -r -p "Press Enter to close this window... "
