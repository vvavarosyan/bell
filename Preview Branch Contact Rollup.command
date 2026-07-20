#!/bin/bash
# PREVIEW the branch contact rollup — shows which unique branch emails/phones would
# be added to their parent company record so one record holds all the operator's
# reachable contacts. Changes NOTHING. (Filters out venue emails scraped off branch
# pages and non-Qatar numbers, so only the company's own contacts roll up.)
# When happy, run "Apply Branch Contact Rollup.command".
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
"$NODE_BIN" scripts/rollup_branch_contacts.js
echo
read -r -p "Press Enter to close this window... "
