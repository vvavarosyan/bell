#!/bin/bash
# Bell — RE-READ the websites of companies whose only stored email is broken,
# and capture the address each site actually publishes (a stated fact — Bell
# never guesses a correction).
#
# Small list (~60 companies with a website). Takes ~10-20 minutes. RESUMABLE:
# close this window any time and re-run — fixed companies leave the list.
# ⚠ Don't run this at the same time as another long enrichment run.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/fix_broken_addresses.js
echo ""
read -p "Press Return to close…"
