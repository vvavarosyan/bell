#!/bin/bash
# Bell.qa — run the QSE scraper once, right now.
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

if [ ! -d node_modules/playwright ]; then
  echo "Dependencies not installed yet — run 'Install Scraper.command' first."
  read -r -p "Press Enter to close..." _; exit 1
fi

"$NODE_BIN" scrape_qse.js

echo
read -r -p "Done. Press Enter to close this window..." _
