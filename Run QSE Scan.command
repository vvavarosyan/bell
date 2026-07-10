#!/bin/bash
# Bell Data Intelligence — Run QSE Scan (Qatar Stock Exchange disclosures)
#
# Captures the newest exchange announcements (financial results, dividends,
# board changes, AGMs, buybacks…) for all ~54 QSE-listed companies, plus their
# financial-statement documents and the exchange's market notices, then
# publishes them to the live site. They become "Disclosures" signals.
#
# Plain web fetch — NO browser or Crawl4AI needed, safe to run any time (even
# while an enrich is running). Usually 2–3 minutes; can take longer when the
# exchange website is slow — leave the window open, or close it and re-run
# later. Safe to re-run anytime — it never duplicates.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/scan_qse.js"

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
