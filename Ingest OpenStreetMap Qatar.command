#!/bin/bash
# Ingest OpenStreetMap Qatar — adds every named business, restaurant, shop, office,
# clinic, hotel and street in Qatar to Bell as a reference layer the map and Bella
# can use. Open data (free to store). Links places to your existing companies where
# a website or phone matches. Then pushes to production by itself.
#
# Takes a few minutes (it politely queries the OSM servers). RESUMABLE — close any
# time and re-run; it continues. Light, but don't run it at the same time as a
# harvester (Reharvest) on the 8 GB Mac. Double-click to run.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi
cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/ingest_osm.js
echo
read -r -p "Press Enter to close this window... "
