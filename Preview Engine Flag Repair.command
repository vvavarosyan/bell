#!/bin/bash
# Bell Data Intelligence — Engine Flag Repair (PREVIEW, read-only)
#
# On 2026-07-09 a "Re-scan tech" click hit an older Portal process, which
# silently re-queued EVERY engine for EVERY company — including Engine 1
# (Website Finder), the only PAID engine (~2 Firecrawl credits per website-less
# company ≈ 120,000 credits for 60k companies).
#
# This PREVIEW shows exactly how many stage flags can be restored, using the
# stage*_status columns the re-queue never touched (they prove which engines
# already ran). NOTHING IS CHANGED. Run "Apply Engine Flag Repair.command" after.

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
"$NODE_BIN" "$SERVER_DIR/scripts/repair_engine_flags.js"

echo
read -r -p "Press Enter to close this window..." _
