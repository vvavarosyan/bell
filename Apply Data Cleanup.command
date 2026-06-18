#!/bin/bash
# Bell Data Intelligence — Apply Data Cleanup (MAKES CHANGES)
# Double-click to actually apply the data-quality cleanup you previewed:
# deletes invalid phones / duplicate-personal-third-party socials / polluted
# emails, fixes website URLs, removes non-person "people", and clears bogus
# shared exec titles. Every deletion is tombstoned so the next sync mirrors the
# cleanup to production too.
#
# Run "Preview Data Cleanup.command" FIRST and read the report. This asks you to
# type YES before it changes anything.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/cleanup_data_quality.js"
REPORT="$SCRIPT_DIR/Portal/Data-Cleanup-Report-APPLIED.txt"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "=========================================================="
echo "   Bell — APPLY Data Cleanup  (this WILL change the DB)"
echo "=========================================================="
echo "Did you run the Preview first and read the report?"
read -r -p "Type YES to apply the cleanup now: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Cancelled — nothing was changed."; read -r -p "Press Enter to close..." _; exit 0
fi

echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT" --apply
echo
[ -f "$REPORT" ] && open "$REPORT"
echo "Next: run \"Push Changes.command\" (then Open Production Release) to mirror"
echo "the cleanup to production."
read -r -p "Press Enter to close this window..." _
