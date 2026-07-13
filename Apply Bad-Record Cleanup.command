#!/bin/bash
# Bell Data Intelligence — APPLY bad-record cleanup (WRITES changes)
#
# Run "Preview Bad-Record Cleanup.command" FIRST and read the list. This then:
#   ① archives the placeholder "people" (Required - OWNER NAME, etc.) — reversible,
#   ② decodes Cloudflare-obfuscated "emails" back to the real address (or clears them).
# Changes publish to the live site on the next data push (Push Changes / any scan).

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1; fi
cd "$SERVER_DIR"
"$NODE_BIN" "$SERVER_DIR/scripts/cleanup_bad_records.js" --apply
echo
read -r -p "Press Enter to close this window..." _
