#!/bin/bash
# Put Qatar companies ON THE MAP — for free, using Qatar's own official locator.
#
# What it does, in order:
#   1. Collects every address Bell already holds (company addresses, website-harvested
#      branches, LinkedIn locations) into the locations list.
#   2. PROVES the Qatar GIS locator against ~30 known buildings first — if accuracy isn't
#      excellent, it stops without writing anything.
#   3. Looks up every address that has Zone + Street + Building numbers and stores the exact
#      coordinates. Addresses it can't resolve are recorded honestly as "not found" — never
#      guessed.
#   4. When everything is done, pushes to the live site — pins appear on the Map.
#
# Plain web fetch — NO browser. RESUMABLE: close this window any time and re-run — it
# continues from exactly where it stopped. Safe to run alongside the always-on engine.
# Speed: ~0.6s per address (being polite to Qatar's servers) — thousands of addresses take
# a few hours; let it run in the background or do it over several evenings.
#
# FIRST TIME: double-click "Open Bell.qa Portal.command" once BEFORE this, so the database
# upgrade is applied.
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
"$NODE_BIN" scripts/geocode_companies.js

echo
read -r -p "Press Enter to close this window... "
