#!/bin/bash
# MONTHLY Google-Maps sweep of Qatar — on the FREE $5 Apify credit.
#
# Uses the proven scraper (winner of the head-to-head test) to collect businesses across
# 24 categories x 6 Qatar areas, tender-heavy categories first. Caps itself at ~1,150 places
# per month so it never exceeds the free credit. Matched places enrich your existing
# companies (ratings, coordinates, place ids — blanks only); unmatched ones are held for
# review, never auto-added.
#
# RESUMABLE: close any time and re-run — finished searches are skipped. Run it once a month
# (any day); it stops by itself at the cap and continues next month.
#
# FIRST TIME: double-click "Open Bell.qa Portal.command" once BEFORE this (database upgrade).
#
# Double-click to run (~15-30 minutes when credit is available).
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi

cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/run_maps_sweep.js

echo
read -r -p "Press Enter to close this window... "
