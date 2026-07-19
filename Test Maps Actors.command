#!/bin/bash
# TEST both Google-Maps scrapers head-to-head before committing the monthly $5 free credit.
#
# Runs the proven actor (compass) and the cheaper email-enriching one (microworlds) on the
# SAME two Doha searches (~50 places each), stores everything, matches places against Bell's
# companies, and prints a side-by-side comparison. Costs ≈ $0.30 of the free credit.
#
# Nothing is auto-added to the company list — new-looking places are held for review.
#
# FIRST TIME: double-click "Open Bell.qa Portal.command" once BEFORE this (database upgrade).
#
# Double-click to run (takes ~3-6 minutes).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi

cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/test_maps_actors.js

echo
read -r -p "Press Enter to close this window... "
