#!/bin/bash
# Bell — MARK the unusable stored email addresses as invalid.
#
# Nothing is deleted and NO address is rewritten. Bell only stops treating these
# as good addresses, so they stop being offered as recipients. You can still see
# and correct every one of them from the list on your Desktop.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
echo "This marks every unusable stored email address as invalid."
echo "The addresses themselves are NOT changed and NOT deleted."
echo ""
read -p "Type yes to continue: " a
[ "$a" = "yes" ] || { echo "Nothing done."; read -p "Press Return to close…"; exit 0; }
echo ""
node scripts/unsendable_addresses.js --apply
echo ""
read -p "Press Return to close…"
