#!/bin/bash
# Bell Data Intelligence — No-Industry Enrichment Diagnostic  (READ-ONLY)
# Profiles the companies that still have NO industry and shows the best way to
# enrich each group: how many we can now classify from Google Maps, how many
# have a website to read, and how many are truly dark. Changes nothing.
# A report is also saved to "NoIndustry-Enrichment-Audit.txt".

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "=========================================================="
echo "   Bell — No-Industry Enrichment Diagnostic (read-only)"
echo "=========================================================="
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SERVER_DIR/scripts/noindustry_enrichment_audit.js"
echo
echo "Nothing was changed. Share the report so we can plan the next enrichment step."
read -r -p "Press Enter to close this window..." _
