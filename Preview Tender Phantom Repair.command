#!/bin/bash
# Bell Data Intelligence — Tender Phantom Repair (PREVIEW, read-only)
#
# Monaqasat card titles often embed an internal committee ref mid-title
# ("… - LTC-2417/2025 - Materials Department"). The old scraper split cards at
# those embedded refs too, minting PHANTOM tenders (fake ref, fragment title
# like "- Materials Department", no detail link) while the real card lost its
# title tail. The scraper is fixed; this PREVIEW lists the phantom rows still
# in the database — each proven against the real "host" tender whose title
# embeds its ref. NOTHING IS CHANGED.
#
# ⚠️ Run a scan with the fixed parser FIRST (Run Tender Scan.command — or
# Backfill Full Tender Archive.command for the whole archive), so host titles
# are healed and phantoms can be proven.

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
"$NODE_BIN" "$SERVER_DIR/scripts/repair_tender_phantoms.js"

echo
read -r -p "Press Enter to close this window..." _
