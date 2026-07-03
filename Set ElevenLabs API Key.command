#!/bin/bash
# Save your ElevenLabs API key into the macOS Keychain (bdi-elevenlabs).
# Bella's VOICE uses this on your Mac: her hearing (speech-to-text) and her
# voice (text-to-speech). The key is typed in by you and stored securely in
# the Keychain — it is NEVER written to a file or committed to git.
#
# (The live servers don't use this file — they read BDI_KEY_ELEVENLABS from
# Railway, which you add once at deploy time.)
set -u

echo "================================================"
echo "   Bell · Set ElevenLabs API key (Bella's voice)"
echo "================================================"
echo
echo "Get your key at https://elevenlabs.io (Profile → API Keys)."
echo
read -r -p "Paste your ElevenLabs API key, then press Enter: " KEY
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "No key entered — nothing saved."
  read -r -p "Press Enter to close..." _
  exit 1
fi

if security add-generic-password -a "bell-data-intelligence" -s "bdi-elevenlabs" -w "$KEY" -U 2>/dev/null; then
  echo
  echo "OK  Saved to your Keychain (bdi-elevenlabs)."
  echo "    Bella can speak the next time you open the local Portal."
else
  echo
  echo "X  Could not save to the Keychain. Try again, or check Keychain Access."
fi
echo
read -r -p "Press Enter to close..." _
