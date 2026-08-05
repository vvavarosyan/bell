#!/bin/bash
# Save your Firecrawl API key into the macOS Keychain (bdi-firecrawl).
# The key is typed in by you and stored securely in the Keychain — it is NEVER
# written to a file or committed to git. Double-click to run.
#
# This is the ONE place the Mac reads the Firecrawl key from: Spark enrichment and
# every Portal caller resolve it through keychain.js (`bdi-firecrawl`). The Windows
# engine box reads BDI_KEY_FIRECRAWL instead, which is what
# "Export Keys for Windows.command" writes — so after changing the key here, run
# that export and give the file to the ROG.
set -u

echo "================================================"
echo "   Bell · Set Firecrawl API key"
echo "================================================"
echo
echo "Get your key at https://firecrawl.dev (Dashboard → API Keys)."
echo "Firecrawl has no 'regenerate' — CREATE a new key, save it here, verify"
echo "everything still works, and only THEN delete the old key."
echo
read -r -p "Paste your Firecrawl API key, then press Enter: " KEY
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "No key entered — nothing saved."
  read -r -p "Press Enter to close..." _
  exit 1
fi

case "$KEY" in
  fc-*) : ;;
  *) echo
     echo "!  That does not look like a Firecrawl key (they start with 'fc-')."
     read -r -p "   Save it anyway? [y/N] " YN
     case "$YN" in [Yy]*) : ;; *) echo "Nothing saved."; read -r -p "Press Enter to close..." _; exit 1 ;; esac ;;
esac

if security add-generic-password -a "bell-data-intelligence" -s "bdi-firecrawl" -w "$KEY" -U 2>/dev/null; then
  echo
  echo "OK  Saved to your Keychain (bdi-firecrawl)."
  echo
  echo "    NEXT, so the engine machine gets it too:"
  echo "      1. Double-click 'Export Keys for Windows.command'"
  echo "      2. Give the file it writes to your Desktop to Claude on the ROG"
  echo "      3. Delete that file from the Desktop afterwards — it contains secrets"
  echo
  echo "    Then update BDI_KEY_FIRECRAWL on Railway (staging AND production),"
  echo "    and only after everything works, delete the old key at firecrawl.dev."
else
  echo
  echo "X  Could not save to the Keychain. Try again, or check Keychain Access."
fi
echo
read -r -p "Press Enter to close..." _
