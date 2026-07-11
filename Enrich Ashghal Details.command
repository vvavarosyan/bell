#!/bin/bash
# Bell Data Intelligence — Enrich Ashghal Details (FULL archive)
#
# Fills the per-tender detail (real description, Tender Bond, Document Fees,
# fuller Category) for ALL Ashghal tenders — the routine scan already covers
# the open ones; this adds the ~2,800 closed/archived.
#
# ★ FULLY RESUMABLE ★ Close this window anytime and re-run later — it
# continues where it stopped. HOURS on the first full run.
#
# Needs the Crawl4AI engine running. If nothing happens, double-click
# "Restart Crawl4AI Engine.command" first. Avoid running this at the same
# time as another long enrich (8 GB Mac).

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/enrich_ashghal_archive.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
