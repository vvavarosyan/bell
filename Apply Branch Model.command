#!/bin/bash
# APPLY the branch model. For each empty facility "shell" that clearly belongs to
# one registered parent, it:
#   • adds the shell as a LOCATION of the parent (if the shell has an address),
#   • links the shell to its parent, and
#   • archives the shell (reversibly — it's marked "branch_collapsed_into" so it
#     can be undone), so one operator stops showing up as a pile of duplicates and
#     the outreach machine stops emailing it several times.
# It then pushes the changes to production by itself.
#
# ⚠️ This CHANGES data. Run "Preview Branch Model.command" FIRST and check the
# numbers. Only clear, unambiguous groups are touched; anything with a generic
# name (e.g. "Al Sultan") is left alone.
#
# Takes a couple of minutes, then pushes to production. Double-click to run.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi

cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/branch_model.js --apply

echo
read -r -p "Press Enter to close this window... "
