#!/bin/bash
# Bell.qa Qatar QFC — deeper diagnostic v2.
# Probes the status filter (counts per category) AND the detail POST
# with three different header configurations to figure out which one
# the live site accepts.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VENV_PY="$SCRIPT_DIR/.venv/bin/python3"
DIAG="$SCRIPT_DIR/state/diagnose.py"

if [ ! -x "$VENV_PY" ]; then
  echo "ERROR: .venv missing. Double-click Install Daily Auto-Scan.command first."
  read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SCRIPT_DIR"
"$VENV_PY" "$DIAG"

echo
echo "------------------------------------------------------------------"
echo "Files now in $SCRIPT_DIR/state/ :"
echo "  diagnostic-summary.txt           (always send this one)"
echo "  diagnostic-detail-A.html         (plain POST)"
echo "  diagnostic-detail-B.html         (POST + Referer/Origin)"
echo "  diagnostic-detail-C.html         (UpdatePanel async postback)"
echo
echo "Send all four files back so the scraper can be finalized."
echo "------------------------------------------------------------------"
read -r -p "Press Enter to close..." _
