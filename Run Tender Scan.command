#!/bin/bash
# Bell Data Intelligence — Run Tender Scan
#
# Double-click to pull Qatar's live PUBLIC tenders into Bell. Right now it
# scrapes Monaqasat (the Ministry of Finance central procurement portal):
# awarded tenders + published/open tenders. They load into the tenders table,
# link to companies where possible, and feed Bella + the Signals in-market
# score. Ashghal and QatarEnergy are being added next.
#
# Needs the Crawl4AI engine running (it renders the government site). If nothing
# comes back, run "Install Crawl4AI Engine.command" or
# "Restart Crawl4AI Engine.command" first. Takes ~1–2 minutes.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_tenders.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "Scanning Qatar public tenders (Monaqasat)…"
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
