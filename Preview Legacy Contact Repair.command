#!/bin/bash
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/legacy_contact_repair.js
echo ""
read -p "Press Return to close…"
