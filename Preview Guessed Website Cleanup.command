#!/bin/bash
# Bell — PREVIEW the guessed-website contamination cleanup. READ-ONLY.
# Shows: which companies lose a website that was only ever a guess shared with
# other companies, and which template contact values (one London phone on 640
# companies…) would be removed. Writes a review file of shared Qatar numbers
# to your Desktop. Nothing is changed.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/guessed_contamination_cleanup.js
echo ""
read -p "Press Return to close…"
