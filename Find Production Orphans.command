#!/bin/bash
# Bell Data Intelligence — Find rows the live site still shows that Bell has deleted
#
# The live site is a copy of Bell's database. When Bell deletes something, the
# deletion is supposed to travel up with it. If that step is ever missed, the row
# stays on the live site forever — a company, a person or a contact Bell has
# already decided is wrong, still being shown to customers.
#
# This compares the two sides row by row and tells you exactly what is stranded.
# It is READ-ONLY: it only reports. Nothing is deleted by running it.
#
# A couple of minutes. Safe to run any time.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SERVER_DIR/scripts/find_prod_orphans.js"

echo
read -r -p "Press Enter to close this window..." _
