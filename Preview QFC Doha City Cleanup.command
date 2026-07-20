#!/bin/bash
# PREVIEW the QFC "Doha" city cleanup — lists the QFC companies whose city was
# guessed as "Doha" by the old importer AND where nothing (coordinate, address,
# other source, or branch) confirms Doha. Changes NOTHING. ~80 rows qualify; the
# other ~5,160 Doha rows are kept because something corroborates them.
#
# Writes the full list to "QFC Doha City — Preview.tsv" at the workspace root.
# When happy, run "Apply QFC Doha City Cleanup.command".
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
"$NODE_BIN" scripts/clean_qfc_doha_city.js

echo
read -r -p "Press Enter to close this window... "
