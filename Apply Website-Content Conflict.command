#!/bin/bash
# Bell — APPLY wrong-CONTENT website fix (writes to the database)
# Re-fetches every harvested company homepage; where the CONTENT is a different brand
# (domain still matches the name), it hides the wrong logo/description/tech + the
# website-harvested contacts from customers and flags the company for review — KEEPING
# the website itself (only the served content is wrong). Everything is snapshotted under
# extra_fields.website_content_conflict (admin can restore). Resumable; re-run safe.
# ⚠ This fetches thousands of websites — PAUSE the always-on engine first
# (local Portal 127.0.0.1:3939 → Local Engines → Pause), and run the Preview first.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break; done
[ -z "$NODE_BIN" ] && { echo "ERROR: Node.js not found."; read -r -p "Press Enter..." _; exit 1; }
cd "$SERVER_DIR"; "$NODE_BIN" "$SERVER_DIR/scripts/flag_website_content_conflicts.js" --apply
echo; read -r -p "Press Enter to close this window..." _
