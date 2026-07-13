#!/bin/bash
# Bell — APPLY industry backfill (WRITES). Run Preview first. Assigns a "derived"
# industry to companies that have none, only when the name/website clearly indicates it.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"; SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""; for c in "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break; done
[ -z "$NODE_BIN" ] && { echo "ERROR: Node.js not found."; read -r -p "Press Enter..." _; exit 1; }
cd "$SERVER_DIR"; "$NODE_BIN" "$SERVER_DIR/scripts/backfill_industries.js" --apply; echo; read -r -p "Press Enter to close..." _
