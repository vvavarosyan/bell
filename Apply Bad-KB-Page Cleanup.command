#!/bin/bash
# Bell Data Intelligence — Bad Qatar-Knowledge-Page Cleanup (⚠️ APPLY — deletes)
#
# Removes the junk pages listed by "Preview Bad-KB-Page Cleanup.command": the
# soft-404 and the Amiri Diwan /ar-qa/ Arabic pages. Deletions are mirrored to
# the live site (app.bell.qa) automatically. Al Meezan's Arabic laws are NEVER
# touched. Run the Preview first so you can see what will be removed.

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
KB_CLEANUP_APPLY=1 "$NODE_BIN" "$SERVER_DIR/scripts/cleanup_bad_kb_pages.js"

echo
read -r -p "Press Enter to close this window..." _
