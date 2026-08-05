#!/bin/bash
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/scan_monaqasat_awards.js
echo ""
read -p "Press Return to close…"
