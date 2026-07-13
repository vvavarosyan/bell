#!/bin/bash
# Bell Data Intelligence — PREVIEW bad-record cleanup (read-only, safe)
#
# Shows what a cleanup WOULD do, without changing anything:
#   ① placeholder "people" from blank registry fields ("Required - OWNER NAME",
#      "Required - CONTACT PERSON") — to be archived (hidden everywhere, reversible).
#   ② Cloudflare-obfuscated "emails" (/cdn-cgi/l/email-protection) — decoded back to
#      the real address where possible, else cleared.
# Nothing is written. Read the list, then run "Apply Bad-Record Cleanup.command".

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1; fi
cd "$SERVER_DIR"
"$NODE_BIN" "$SERVER_DIR/scripts/cleanup_bad_records.js"
echo
read -r -p "Press Enter to close this window..." _
