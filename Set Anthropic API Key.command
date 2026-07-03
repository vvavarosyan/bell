#!/bin/bash
# Save your Anthropic API key into the macOS Keychain (bdi-anthropic).
# Bella (the portal assistant) and the news summarizer use this key on your
# Mac. The key is typed in by you and stored securely in the Keychain — it is
# NEVER written to a file or committed to git. Double-click to run.
#
# (The live servers don't use this file — they read BDI_KEY_ANTHROPIC from
# Railway, which is already set.)
set -u

echo "================================================"
echo "   Bell · Set Anthropic API key (Bella's brain)"
echo "================================================"
echo
echo "Get your key at https://console.anthropic.com (API Keys)."
echo
read -r -p "Paste your Anthropic API key, then press Enter: " KEY
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "No key entered — nothing saved."
  read -r -p "Press Enter to close..." _
  exit 1
fi

if security add-generic-password -a "bell-data-intelligence" -s "bdi-anthropic" -w "$KEY" -U 2>/dev/null; then
  echo
  echo "OK  Saved to your Keychain (bdi-anthropic)."
  echo "    Bella will use it the next time you open the local Portal."
else
  echo
  echo "X  Could not save to the Keychain. Try again, or check Keychain Access."
fi
echo
read -r -p "Press Enter to close..." _
