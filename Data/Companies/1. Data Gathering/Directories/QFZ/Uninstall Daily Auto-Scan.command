#!/bin/bash
# Bell.qa Qatar — remove the daily auto-scan schedule.

PLIST_FILE="$HOME/Library/LaunchAgents/com.bell-qa.qfz-scraper.plist"

echo "=========================================================="
echo "   Bell.qa Qatar — Uninstall Daily Auto-Scan"
echo "=========================================================="
echo

if [ ! -f "$PLIST_FILE" ]; then
  echo "Nothing to remove — no schedule is currently installed."
else
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  rm -f "$PLIST_FILE"
  echo "Schedule removed. The scraper will no longer run automatically."
fi

echo
echo "Your previous scans in scans/qfz/ are untouched."
read -r -p "Press Enter to close..." _
