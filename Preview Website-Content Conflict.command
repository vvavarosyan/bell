#!/bin/bash
# Bell — PREVIEW wrong-CONTENT website check (read-only, safe)
# Re-fetches a sample of harvested company homepages and lists any whose CONTENT
# belongs to a different brand even though the domain matches the company name
# (e.g. foundationendowment.com serving a "Smart Evolution" tech blog). Nothing is
# written. Review, then run "Apply Website-Content Conflict.command".
# NOTE: this fetches websites — pause the always-on engine first
# (local Portal 127.0.0.1:3939 → Local Engines → Pause).
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break; done
[ -z "$NODE_BIN" ] && { echo "ERROR: Node.js not found."; read -r -p "Press Enter..." _; exit 1; }
cd "$SERVER_DIR"; "$NODE_BIN" "$SERVER_DIR/scripts/flag_website_content_conflicts.js"
echo; read -r -p "Press Enter to close this window..." _
