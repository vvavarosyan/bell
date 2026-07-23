#!/bin/bash
# Bell.qa Qatar QFC — remove the daily auto-scan schedule.
PLIST_FILE="$HOME/Library/LaunchAgents/com.bell-qa.qfc-scraper.plist"

echo "=========================================================="
echo "   Bell.qa Qatar QFC — Uninstall Daily Auto-Scan"
echo "=========================================================="
echo

if [ ! -f "$PLIST_FILE" ]; then
  echo "Nothing to remove — no QFC schedule is installed."
else
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  rm -f "$PLIST_FILE"
  echo "Schedule removed. QFC scraper will no longer auto-run."
fi

echo
echo "Your scans/ output and state/ progress are untouched."
read -r -p "Press Enter to close..." _
