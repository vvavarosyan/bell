#!/bin/bash
# Bell Data Intelligence — Run Ashghal Scan
#
# Double-click to pull Ashghal (Public Works Authority) tenders into Bell from
# ashghal.gov.qa — its own e-Tenders + General tender lists (Open + Closed).
# They load into the shared tenders table (source = ashghal) and publish to the
# live site. This is Ashghal's own portal (separate from Monaqasat), added as a
# second tender source.
#
# Needs the Crawl4AI engine running (it renders the government site). If nothing
# comes back, run "Install Crawl4AI Engine.command" or
# "Restart Crawl4AI Engine.command" first.
#
# Note: the Awarded-winner tables, Prospected (upcoming) and Pre-Qualification
# pages are a follow-up — this first version captures the tender lists.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_ashghal.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "Scanning Ashghal tenders (Public Works Authority)…"
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
