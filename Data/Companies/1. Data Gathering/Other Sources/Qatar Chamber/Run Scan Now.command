#!/bin/bash
# Bell.qa — harvest the Qatar Chamber directory via Firecrawl, right now.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found. Install from https://nodejs.org and try again."
  read -r -p "Press Enter to close..." _; exit 1
fi

if [ ! -f firecrawl.key ] && [ -z "$FIRECRAWL_API_KEY" ]; then
  echo "No Firecrawl API key yet. Run 'Set Firecrawl API Key.command' first."
  read -r -p "Press Enter to close..." _; exit 1
fi

echo "Harvesting Qatar Chamber directory (this can take a while for the full site)…"
# Keep the Mac awake for the whole run (prevents idle-sleep crashes).
CAFF=""; command -v caffeinate >/dev/null 2>&1 && CAFF="caffeinate -i"
$CAFF "$NODE_BIN" scrape_qatarcid.js

echo
read -r -p "Done. Press Enter to close this window..." _
