#!/bin/bash
# Bell.qa — save your Firecrawl API key for the Qatar Chamber scraper.
# You only need to do this once (or again if your key changes).
# The key is stored locally in firecrawl.key (next to this file) and is NEVER
# uploaded anywhere.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo "   Set Firecrawl API key"
echo "=========================================================="
echo
echo "Find your key at: https://www.firecrawl.dev/app/api-keys"
echo "(it looks like  fc-xxxxxxxxxxxxxxxx )"
echo
read -r -p "Paste your Firecrawl API key: " KEY
KEY="$(echo "$KEY" | tr -d '[:space:]')"
if [ -z "$KEY" ]; then
  echo "No key entered. Nothing saved."
  read -r -p "Press Enter to close..." _; exit 1
fi
printf '%s' "$KEY" > firecrawl.key
chmod 600 firecrawl.key
echo
echo "Saved to firecrawl.key. You can now run 'Run Scan Now.command'."
read -r -p "Press Enter to close..." _
