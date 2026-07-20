#!/bin/bash
# Re-harvest every website company for LOCATIONS — captures branch addresses AND
# Google-Maps location links (exact coordinates) from each company's own website.
# This is what gets DOC Medical Center's 3 website branches onto the map, and does
# the same for every other multi-location company.
#
# The always-on engine should be PAUSED first (local Portal → Local Engines →
# Pause) so two harvesters don't run at once on this 8 GB Mac.
#
# RESUMABLE + long: close any time and re-run — finished companies are skipped.
# Leave it overnight; it stops by itself. When done, run "Geocode Companies.command".
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
"$NODE_BIN" scripts/reharvest_locations.js

echo
read -r -p "Press Enter to close this window... "
