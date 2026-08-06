#!/bin/bash
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/heal_stranded_children.js --apply
echo ""
read -p "Press Return to close…"
