#!/bin/bash
# Bell Data Intelligence — Run Qatar GIS Scan (Real Estate data)
#
# Pulls Qatar's public GIS map data — municipalities, districts, zones, and named
# buildings (with addresses, phones, photos) — plus promotes the weekly real-estate
# sales figures Bell already has into a proper Real Estate table. Then publishes it
# to the live site.
#
# Plain web fetch — NO browser needed, safe to run any time (even during an enrich).
# A few minutes. Idempotent: re-running never duplicates. If the network stalls,
# just run it again — it resumes cleanly.
#
# NOTE: the first time, double-click "Open Bell.qa Portal.command" once BEFORE this,
# so the database upgrade (the new Real Estate tables) is applied.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_gis.js"

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
