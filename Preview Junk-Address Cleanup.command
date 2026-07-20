#!/bin/bash
# PREVIEW the junk-address cleanup — lists the stored "addresses" that are really
# scraped page junk (copyright lines, "Since 1999" taglines, "Please enter a valid
# number" form text, web-design credits). Changes NOTHING.
#
# Writes the full list to "Junk Addresses — Preview.tsv" at the workspace root.
# When happy, run "Apply Junk-Address Cleanup.command".
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
"$NODE_BIN" scripts/clean_junk_addresses.js

echo
read -r -p "Press Enter to close this window... "
