#!/bin/bash
# Bell.qa Qatar QSTP — remove the daily auto-scan schedule.
PLIST_FILE="$HOME/Library/LaunchAgents/com.bell-qa.qstp-scraper.plist"
echo "=========================================================="
echo "   Bell.qa Qatar QSTP — Uninstall Daily Auto-Scan"
echo "=========================================================="
echo
if [ ! -f "$PLIST_FILE" ]; then
  echo "Nothing to remove — no QSTP schedule is installed."
else
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  rm -f "$PLIST_FILE"
  echo "Schedule removed. QSTP scraper will no longer auto-run."
fi
echo
echo "Your scans/ output and node_modules are untouched."
read -r -p "Press Enter to close..." _
