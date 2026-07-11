#!/bin/bash
# Bell Data Intelligence — Run Kahramaa Scan (tenders + awards)
#
# Captures Kahramaa's full tender archive (open + closed, ~1,650) and every
# business-award category WITH the winning company and amount, then publishes
# to the live site. Kahramaa becomes tender source #4 (Monaqasat, Ashghal,
# QatarEnergy, Kahramaa).
#
# Plain web fetch — NO browser or Crawl4AI needed, safe to run any time.
# About 1–2 minutes. Safe to re-run anytime — it never duplicates.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_kahramaa.js"

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
