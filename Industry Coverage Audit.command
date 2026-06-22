#!/bin/bash
# Bell Data Intelligence — Industry Coverage Audit  (READ-ONLY, changes nothing)
# Measures whether every company is findable by an industry filter. It reports:
#   • how many ACTIVE companies have no industry today (missed by filters),
#   • how many a re-derive (the Backfill Industries command) would classify,
#   • the residual gap: unmapped source labels (fixable) vs no signal at all,
#   • the TOP unmapped source labels — share these so the map can be extended,
#   • projected coverage per industry.
# A report is also saved to "Industry-Coverage-Audit.txt" next to this file.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/industry_coverage_audit.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "=========================================================="
echo "   Bell — Industry Coverage Audit (read-only)"
echo "=========================================================="
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"
echo
echo "Nothing was changed. Share the report above (or the saved"
echo "Industry-Coverage-Audit.txt) so the unmapped labels can be added."
read -r -p "Press Enter to close this window..." _
