#!/bin/bash
# Bell.qa Qatar QSTP — run the scraper on demand.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRAPER="$SCRIPT_DIR/scrape_qstp.js"

# Locate Node
NODE_BIN=""
for candidate in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
    break
  fi
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is not installed. Install from https://nodejs.org and try again."
  read -r -p "Press Enter to close..." _; exit 1
fi

# Ensure dependencies are installed
if [ ! -d "$SCRIPT_DIR/node_modules/axios" ] || [ ! -d "$SCRIPT_DIR/node_modules/cheerio" ]; then
  echo "First-time setup: installing dependencies (axios, cheerio)..."
  NPM_BIN="$(dirname "$NODE_BIN")/npm"
  cd "$SCRIPT_DIR"
  if [ -x "$NPM_BIN" ]; then
    "$NPM_BIN" install --no-audit --no-fund --silent
  else
    npm install --no-audit --no-fund --silent
  fi
fi

cd "$SCRIPT_DIR"
"$NODE_BIN" "$SCRAPER"

echo
read -r -p "Done. Press Enter to close..." _
