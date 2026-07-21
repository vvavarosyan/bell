#!/bin/bash
# Follow the Google-Maps share links on company websites and put those branches on
# the map. Many Qatari sites pin their branches with SHORT links
# (maps.app.goo.gl/...) which carry no coordinates until you follow them — Bell was
# throwing those away. This is exactly what was hiding DOC Medical Center's Lusail
# and Izghawa branches.
#
# Coordinates come from Google's own pin for that place — exact, nothing guessed.
# Targets the companies that stand to gain: website companies with nothing on the
# map yet. RESUMABLE — close any time and re-run. Pushes to production itself.
#
# Long run (~10-20s per company). Don't run it alongside another harvester.
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
"$NODE_BIN" scripts/resolve_map_links.js
echo
read -r -p "Press Enter to close this window... "
