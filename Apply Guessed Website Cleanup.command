#!/bin/bash
# Bell — APPLY the guessed-website contamination cleanup.
# Withdraws provably-wrong website claims (guessed domains shared by several
# companies), removes the contacts harvested from those wrong sites and the
# template values scattered across many companies — all with tombstones so the
# live site drops them too. Qatar-format shared numbers are NOT touched (they
# stay in the Desktop review file). Rebuilds the legacy contact columns after.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
echo "This removes provably-wrong websites and template contacts from the database."
echo "Real data is never touched; every removal has stated evidence."
echo ""
read -p "Type yes to continue: " a
[ "$a" = "yes" ] || { echo "Nothing done."; read -p "Press Return to close…"; exit 0; }
echo ""
node scripts/guessed_contamination_cleanup.js --apply
echo ""
read -p "Press Return to close…"
