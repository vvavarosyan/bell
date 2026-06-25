#!/bin/bash
# Save your Reoon email-verification API key into the macOS Keychain (bdi-reoon).
# The key is typed in by you and stored securely in the Keychain — it is NEVER
# written to a file or committed to git. Double-click to run.
set -u

echo "================================================"
echo "   Bell · Set Reoon email-verification API key"
echo "================================================"
echo
echo "Get your key at https://emailverifier.reoon.com (Dashboard → API)."
echo
read -r -p "Paste your Reoon API key, then press Enter: " KEY
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "No key entered — nothing saved."
  read -r -p "Press Enter to close..." _
  exit 1
fi

if security add-generic-password -a "bell-data-intelligence" -s "bdi-reoon" -w "$KEY" -U 2>/dev/null; then
  echo
  echo "OK  Saved to your Keychain (bdi-reoon)."
  echo "    Bell's email engine will now use Reoon to verify decision-maker emails."
  echo "    Restart the engine (double-click 'Install Always-On Engine.command') to pick it up."
else
  echo
  echo "X  Could not save to the Keychain. Try again, or check Keychain Access."
fi
echo
read -r -p "Press Enter to close..." _
