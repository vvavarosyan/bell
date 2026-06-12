#!/bin/bash
# Bell.qa — one-time setup for the Stage 7 Local Website Harvester's headless
# render tier. Installs Playwright + a headless Chromium (~150 MB) into an
# isolated folder so JavaScript-rendered company websites can be harvested.
#
# This is LOCAL-ONLY: it is not part of the Portal's deployed dependencies, so
# nothing here ships to Railway. You only need to run this once (re-run it if a
# fresh setup ever wipes node_modules). If you already installed the MoPH
# scraper's browser, the ~150 MB download is reused and this finishes fast.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BROWSER_DIR="$SCRIPT_DIR/Portal/server/enrichment/local/browser"

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
export PATH="$(dirname "$NODE_BIN"):$PATH"

if [ ! -d "$BROWSER_DIR" ]; then
  echo "ERROR: $BROWSER_DIR not found. Pull the latest code (Open Production Release / git pull) first."
  read -r -p "Press Enter to close..." _; exit 1
fi
cd "$BROWSER_DIR"

echo "Installing Playwright (this can take a minute the first time)…"
"$NPM_BIN" install

echo
echo "Downloading the headless browser (~150 MB, one-time; reused if already present)…"
"$NPM_BIN" exec -- playwright install chromium

echo
echo "✓ Setup complete. Restart the Portal, then re-run Stage 7 — it will now"
echo "  render JavaScript-only websites (Wix / SPA / QFZ-builder sites)."
read -r -p "Press Enter to close..." _
