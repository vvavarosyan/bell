#!/bin/bash
# Bell — DATA GAP AUDIT. Asks the standing question: "does Bell actually USE
# everything that enters it?"
#
# It compares what the harvest SAW against what Bell KEPT. A gap there means data
# is being discarded on the floor — which is exactly how DOC Medical Center's three
# branch map-links were lost without anyone noticing.
#
# READ-ONLY. Changes nothing. Safe to run any time, even while other jobs run.
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
"$NODE_BIN" scripts/data_gap_audit.js
echo
read -r -p "Press Enter to close this window... "
