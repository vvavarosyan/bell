#!/bin/bash
# Preview the gazetteer geocode — puts addresses written the HUMAN way on the map
# ("Marina 50, Lusail", "Tornado Tower", "27 Al Kinana Street") by matching the
# building or street NAME against Qatar's own surveyed register, then confirming
# with the national locator. It only writes an exact match — never a guess.
#
# This is what finally places DOC Medical Center's Lusail branch, plus ~1,600 more.
# Changes NOTHING — it just reports what can be placed. Safe any time.
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
"$NODE_BIN" scripts/gazetteer_geocode.js
echo
read -r -p "Press Enter to close this window... "
