#!/bin/bash
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/compare_bella_voices.js
echo ""
read -p "Press Return to close…"
