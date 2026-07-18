#!/bin/bash
# Preview the emails Bell's self-marketing engine WOULD send — without sending anything.
#
# It drafts real emails for a spread of Qatar companies (English, Arabic, and bilingual),
# using your live database and the exact composer the engine uses at send time, then opens
# an HTML page on your Desktop so you can read them. SENDS NOTHING. Safe to run any time.
#
# Double-click to run.
set -u
cd "$(dirname "$0")/Portal" || exit 1

echo "======================================================"
echo "   Bell · Outreach Email Preview  (dry run, no send)"
echo "======================================================"
echo

# How many English samples (default 8). You can pass a number by running from Terminal,
# but double-clicking uses the default.
N="${1:-8}"

node server/scripts/preview_outreach.mjs "$N"
CODE=$?

echo
if [ $CODE -eq 0 ]; then
  OUT="$HOME/Desktop/Bell Outreach Preview.html"
  [ -f "$OUT" ] && open "$OUT"
  echo "Done. The preview opened in your browser (also saved to your Desktop as 'Bell Outreach Preview.html')."
else
  echo "Something went wrong (code $CODE). Copy the lines above to Claude."
fi
echo
read -r -p "Press Enter to close this window. "
