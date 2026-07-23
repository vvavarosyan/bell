#!/bin/bash
# Bell.qa Qatar MOCI — remove the weekly auto-scan schedule.
PLIST_FILE="$HOME/Library/LaunchAgents/com.bell-qa.moci-scraper.plist"
echo "================================================================"
echo "   Bell.qa Qatar MOCI — Uninstall Schedule"
echo "================================================================"
echo
if [ ! -f "$PLIST_FILE" ]; then
  echo "Nothing to remove — no MOCI schedule is installed."
else
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  rm -f "$PLIST_FILE"
  echo "Schedule removed. MOCI scraper will no longer auto-run."
fi
echo
echo "Your scans/ output and state/ progress are untouched."
read -r -p "Press Enter to close..." _
