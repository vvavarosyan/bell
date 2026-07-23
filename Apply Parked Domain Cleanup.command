#!/bin/bash
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/logo_cleanup.js --apply
echo ""
read -p "Press Return to close…"
