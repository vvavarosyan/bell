#!/bin/bash
# Bell — APPLY wrong-company website fix (WRITES changes)
# Run "Preview Website-Conflict Fix.command" FIRST. This hides each flagged wrong
# website + its harvested emails/contacts from customers (kept in admin, needs_review),
# preserving the originals in extra_fields. Publishes on the next data push.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break; done
[ -z "$NODE_BIN" ] && { echo "ERROR: Node.js not found."; read -r -p "Press Enter..." _; exit 1; }
cd "$SERVER_DIR"; "$NODE_BIN" "$SERVER_DIR/scripts/flag_website_conflicts.js" --apply
echo; read -r -p "Press Enter to close this window..." _
