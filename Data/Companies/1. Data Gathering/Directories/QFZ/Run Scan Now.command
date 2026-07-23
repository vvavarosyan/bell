#!/bin/bash
# Bell.qa Qatar — run the QFZ scraper once, right now.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

NODE_BIN=""
for candidate in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
    break
  fi
done

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is not installed. Install from https://nodejs.org and try again."
  read -r -p "Press Enter to close..." _
  exit 1
fi

cd "$SCRIPT_DIR"
"$NODE_BIN" scrape_qfz.js

echo
read -r -p "Done. Press Enter to close this window..." _
