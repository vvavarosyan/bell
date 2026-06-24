#!/bin/bash
# Bell Data Intelligence — Stop & remove the Always-On Enrichment Engine.
# Your data is untouched; the frontier resumes if you re-install later.
PLIST_DIR="$HOME/Library/LaunchAgents"
LABEL="com.bell-qa.continuous-engine"
PLIST_FILE="$PLIST_DIR/$LABEL.plist"

echo "Stopping the always-on enrichment engine..."
launchctl unload "$PLIST_FILE" 2>/dev/null || true
rm -f "$PLIST_FILE"
echo "Done — the continuous engine is stopped and will not start at login."
echo
read -r -p "Press Enter to close..." _
