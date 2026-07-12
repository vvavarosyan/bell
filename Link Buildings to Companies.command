#!/bin/bash
# Bell Data Intelligence — Link Buildings to Companies
#
# Connects Qatar GIS buildings to Bell company records — but ONLY where a
# building's email is a real, unique address that maps to exactly one company
# AND the names agree. Anything uncertain is left unlinked (never guessed).
# Fast (no web fetch). Publishes to the live site. Safe to re-run.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/link_buildings.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
