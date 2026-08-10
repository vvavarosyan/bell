#!/bin/bash
# Bell — LIST the stored email addresses a mail provider will reject.
# READ-ONLY. Writes a full list to your Desktop. Nothing is changed.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/unsendable_addresses.js
echo ""
read -p "Press Return to close…"
