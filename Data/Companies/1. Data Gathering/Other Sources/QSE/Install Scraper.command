#!/bin/bash
# Bell.qa — one-time setup for the QSE scraper (installs Playwright + a headless
# browser, ~150 MB). You only need to run this once.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Locate Node + npm (covers Homebrew + standard installs).
NODE_BIN=""; NPM_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
for c in "$(command -v npm 2>/dev/null)" "/opt/homebrew/bin/npm" "/usr/local/bin/npm" "/usr/bin/npm"; do
  [ -n "$c" ] && [ -x "$c" ] && NPM_BIN="$c" && break
done
if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
  echo "ERROR: Node.js/npm not found. Install Node from https://nodejs.org and try again."
  read -r -p "Press Enter to close..." _; exit 1
fi
# Put node's dir on PATH so 'npx' works for the playwright browser download.
export PATH="$(dirname "$NODE_BIN"):$PATH"

echo "Installing scraper dependencies (this can take a couple of minutes the first time)…"
"$NPM_BIN" install

echo
echo "Downloading the headless browser (~150 MB, one-time)…"
"$NPM_BIN" exec -- playwright install chromium

echo
echo "Setup complete. You can now use 'Run Scan Now.command'."
read -r -p "Press Enter to close..." _
