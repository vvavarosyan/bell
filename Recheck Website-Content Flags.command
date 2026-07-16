#!/bin/bash
# Bell — RE-CHECK the website-content flags and GIVE BACK any data wrongly hidden.
#
# Re-examines every company currently flagged as "website content is a different company"
# using the CURRENT (stricter) rules, and automatically RESTORES the ones that no longer
# qualify — logo, description, tech and website contacts all come back, and the review flag
# clears. Companies whose sites really are serving someone else's content stay flagged.
#
# Safe: it only ever restores. It never hides anything new (use "Apply Website-Content
# Conflict.command" for that).
# NOTE: it re-fetches those sites — pause the always-on engine first
# (local Portal 127.0.0.1:3939 → Local Engines → Pause).
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break; done
[ -z "$NODE_BIN" ] && { echo "ERROR: Node.js not found."; read -r -p "Press Enter..." _; exit 1; }
cd "$SERVER_DIR"; "$NODE_BIN" "$SERVER_DIR/scripts/flag_website_content_conflicts.js" --recheck --apply
echo; read -r -p "Press Enter to close this window..." _
