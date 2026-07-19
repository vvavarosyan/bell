#!/bin/bash
# Find the MISSING EMAILS — re-harvest every company that was already website-scanned but
# still has no email address (~8,600 companies, the proven extractor-miss group).
#
# The harvester has been upgraded: it now keeps the company's real mailbox even when it's on
# a different domain (the Doha Clinic case), decodes hidden/obfuscated emails, captures
# WhatsApp numbers and branch addresses, and reads more pages (locations, /en/ pages,
# JavaScript-rendered contact pages).
#
# Plain web fetch, 7 sites at a time. RESUMABLE: close this window any time and re-run —
# companies that gained an email leave the list automatically. Takes hours for the full
# list; run it overnight or in the background.
# ⚠ Don't run this at the same time as another long enrich (8 GB Mac).
#
# Double-click to run.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi

cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/reharvest_no_email.js

echo
read -r -p "Press Enter to close this window... "
