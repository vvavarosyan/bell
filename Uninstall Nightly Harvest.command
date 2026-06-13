#!/bin/bash
# Bell Data Intelligence — Uninstall Nightly Harvest Sweep
# Double-click to STOP the automatic nightly harvest. Your data stays; only the
# schedule is removed. Re-enable any time with "Install Nightly Harvest.command".

LABEL="com.bell-qa.harvest-sweep"
PLIST_FILE="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "=========================================================="
echo "   Bell Data Intelligence — Uninstall Nightly Harvest"
echo "=========================================================="
echo

if [ -f "$PLIST_FILE" ]; then
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  rm -f "$PLIST_FILE"
  echo "✓ Nightly harvest schedule removed."
else
  echo "Nothing to remove — no nightly harvest schedule was installed."
fi
echo
read -r -p "Press Enter to close this window..." _
