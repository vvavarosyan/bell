#!/bin/bash
# Bell Data Intelligence — Run Qatar Cadastre Scan (every land parcel)
#
# Gathers EVERY land parcel (~253,000, with its size) and land-use area
# (~190,000, with its zoning) in Qatar — the "box for every area", including
# empty land — and locates each inside its district. Then publishes to the live
# site.
#
# Plain web fetch — NO browser. RESUMABLE: it takes ~20–30 minutes, but you can
# close this window any time and re-run — it continues from exactly where it
# stopped. Safe to run alongside the always-on engine (light on memory).
#
# NOTE: the first time, double-click "Open Bell.qa Portal.command" once BEFORE
# this so the database upgrade (the new parcel tables) is applied.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_parcels.js"

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
