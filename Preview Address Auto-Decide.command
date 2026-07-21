#!/bin/bash
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/address_auto_decide.js
echo ""
read -p "Press Return to close…"
