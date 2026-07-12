#!/bin/bash
# Bell Data Intelligence — Preview QFC Capital (writes NOTHING)
#
# Shows exactly what financial data would be added from the QFC (Qatar Financial
# Centre) public register: each firm's Authorised + Issued Share Capital, which
# Bell already captured. This just previews the parsed numbers + a per-currency
# count so you can sanity-check before applying. It changes nothing.
#
# When the numbers look right, double-click "Backfill QFC Capital.command".

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/backfill_qfc_capital.js"

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
