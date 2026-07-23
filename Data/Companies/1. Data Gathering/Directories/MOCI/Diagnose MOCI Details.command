#!/bin/bash
# Bell.qa Qatar MOCI — Stage-2 DETAIL diagnose (live capture, run once).
# Opens a visible Chrome, you click "Search for Organizations" once, and it
# captures + replays the report's own querydata request with our batched
# detail + activity queries for a few real CR numbers. Read-only probe —
# nothing is written to Bell. Writes state/diagnostic-details.json for Claude.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VENV_PY="$SCRIPT_DIR/.venv/bin/python3"
PROBE="$SCRIPT_DIR/diagnose_details.py"

if [ ! -x "$VENV_PY" ]; then
  echo "ERROR: Python virtualenv not found at .venv/"
  echo "Double-click 'Install Daily Auto-Scan.command' first to set it up."
  read -r -p "Press Enter to close..." _; exit 1
fi

echo "MOCI Stage-2 detail diagnose — a Chrome window will open."
echo "Click 'Search for Organizations' once, then come back here."
echo

cd "$SCRIPT_DIR"
"$VENV_PY" "$PROBE"

echo
echo "------------------------------------------------------------------"
echo "If it saved state/diagnostic-details.json, send that file to Claude."
echo "------------------------------------------------------------------"
read -r -p "Press Enter to close..." _
