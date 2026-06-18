#!/bin/bash
# Bell Data Intelligence — Preview Data Cleanup (DRY-RUN, safe)
# Double-click to scan the WHOLE local database and see exactly what the
# data-quality cleanup WOULD fix — invalid phone numbers, duplicate / personal /
# third-party social links, polluted emails, markdown website URLs, non-person
# "people", and bogus shared exec titles. NOTHING is changed. A report opens at
# the end (also saved as Portal/Data-Cleanup-Report-PREVIEW.txt).
#
# When you're happy with the preview, run "Apply Data Cleanup.command".

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/cleanup_data_quality.js"
REPORT="$SCRIPT_DIR/Portal/Data-Cleanup-Report-PREVIEW.txt"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "=========================================================="
echo "   Bell — Data Cleanup PREVIEW (dry-run, nothing changes)"
echo "=========================================================="
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"
echo
[ -f "$REPORT" ] && open "$REPORT"
read -r -p "Press Enter to close this window..." _
