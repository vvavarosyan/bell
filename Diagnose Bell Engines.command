#!/bin/bash
# Bell Data Intelligence — Engine & Tender diagnostic (READ-ONLY)
#
# Answers with evidence, not guesses:
#   • is the always-on engine actually beating? (or did the daemon die?)
#   • did migration 076 (Engine 6 · Tech Stack) apply?
#   • are Crawl4AI / Playwright up? (if neither, every detail fetch fails instantly)
#   • were the engine stage flags accidentally mass-reset? (paid-search warning)
#   • WHY are the last Monaqasat tenders stuck — it fetches real detail pages.
#
# Nothing is changed. Safe to run any time. Send the output to Claude.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/diagnose_engines.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
