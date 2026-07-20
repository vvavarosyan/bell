#!/bin/bash
# PREVIEW — companies whose NAME clearly contradicts their tagged industry
# (a barbershop tagged "Banking", a dry-cleaner tagged "Oil & Gas" — QCCI
# mis-categorisation). Shows every before→after. Writes NOTHING.
#
# Safe to run any time. When the list looks right, double-click
# "Apply Industry Contradiction Fix.command" to correct them.
#
# Double-click to run (seconds).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi

cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/fix_industry_contradictions.js

echo
read -r -p "Press Enter to close this window... "
