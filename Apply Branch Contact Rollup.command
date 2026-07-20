#!/bin/bash
# APPLY the branch contact rollup — adds each operator's unique branch emails/phones
# to the parent company record (tagged so it stays reversible), rescoring each
# parent, then pushes to production by itself.
# ⚠️ This CHANGES data. Run "Preview Branch Contact Rollup.command" FIRST.
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
"$NODE_BIN" scripts/rollup_branch_contacts.js --apply
echo
read -r -p "Press Enter to close this window... "
