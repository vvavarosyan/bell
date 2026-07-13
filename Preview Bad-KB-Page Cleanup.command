#!/bin/bash
# Bell Data Intelligence — Bad Qatar-Knowledge-Page Cleanup (PREVIEW, read-only)
#
# The first regulator scan (2026-07-13) let a little junk into the Qatar
# Knowledge Base from Amiri Diwan (a Sitecore site): one SOFT-404 page (the
# server answered "OK" but the page said "404 Page") and a handful of ARABIC
# pages served under an /ar-qa/ web address that were mis-labelled English.
#
# This PREVIEW lists exactly which pages would be removed. NOTHING IS CHANGED.
# Al Meezan's Arabic LAWS are legitimate and are never touched.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SERVER_DIR/scripts/cleanup_bad_kb_pages.js"

echo
read -r -p "Press Enter to close this window..." _
