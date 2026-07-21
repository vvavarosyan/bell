#!/bin/bash
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/location_merge.js --apply
echo ""
read -p "Press Return to close…"
