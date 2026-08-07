#!/bin/bash
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/auto_merge_registrations.js
echo ""
read -p "Press Return to close…"
