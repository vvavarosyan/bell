#!/bin/bash
# Bell Data Intelligence — Run QatarEnergy Scan
#
# QatarEnergy publishes its tenders through a JSON web service, so this scan does
# NOT need the Crawl4AI engine — it's a quick fetch. It captures open + upcoming
# tenders and all awarded contracts / POs / agreements (with the winning
# contractor), links winners to your companies, and publishes to the live site.
# Safe to re-run anytime.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_qatarenergy.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "Scanning QatarEnergy tenders…"
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
