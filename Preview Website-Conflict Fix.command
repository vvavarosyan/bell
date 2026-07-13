#!/bin/bash
# Bell — PREVIEW wrong-company website fix (read-only, safe)
# Lists companies whose website provably belongs to a DIFFERENT company (e.g.
# "Integrated Technical Services" carrying Arabian MEP's site). Nothing is written.
# Review the list, then run "Apply Website-Conflict Fix.command".
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break; done
[ -z "$NODE_BIN" ] && { echo "ERROR: Node.js not found."; read -r -p "Press Enter..." _; exit 1; }
cd "$SERVER_DIR"; "$NODE_BIN" "$SERVER_DIR/scripts/flag_website_conflicts.js"
echo; read -r -p "Press Enter to close this window..." _
