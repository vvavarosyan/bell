#!/bin/bash
# APPLY the QFC "Doha" city cleanup — clears the guessed "Doha" city on the ~80 QFC
# companies where nothing confirms Doha (several are actually in Lusail). All other
# Doha rows are left alone. Forward-only importer fix already stops new guesses.
# It then pushes the changes to production by itself.
#
# ⚠️ This CHANGES data. Run "Preview QFC Doha City Cleanup.command" FIRST.
# Only the city field is cleared; name, address, everything else is untouched.
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
"$NODE_BIN" scripts/clean_qfc_doha_city.js --apply

echo
read -r -p "Press Enter to close this window... "
