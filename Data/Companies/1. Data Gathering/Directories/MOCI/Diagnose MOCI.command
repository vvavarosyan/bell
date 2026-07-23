#!/bin/bash
# Bell.qa Qatar MOCI — Diagnostic capture
# Launches Chromium, loads the live MOCI page, captures Power BI traffic
# for ~45 seconds, writes the result to state/diagnostic-*.{json,txt}.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VENV_PY="$SCRIPT_DIR/.venv/bin/python3"
SCRAPER="$SCRIPT_DIR/scraper.py"

if [ ! -x "$VENV_PY" ]; then
  echo "ERROR: Python virtualenv not found at .venv/"
  echo "Double-click 'Install Daily Auto-Scan.command' first to set it up."
  read -r -p "Press Enter to close..." _; exit 1
fi

echo "Running MOCI diagnostic (will take ~60 seconds)..."
echo "If MOCI is currently 503-ing the scrape will still capture whatever"
echo "the site returns; just re-run when MOCI is back up."
echo

cd "$SCRIPT_DIR"
SCRAPE_MODE=diagnose \
SCRAPE_HEADLESS=true \
  "$VENV_PY" "$SCRAPER"

echo
echo "------------------------------------------------------------------"
echo "Diagnostic complete. Files written to:"
echo "  $SCRIPT_DIR/state/diagnostic-summary.txt"
echo "  $SCRIPT_DIR/state/diagnostic-wabi.json"
echo "  $SCRIPT_DIR/state/diagnostic-all-requests.json"
echo "  $SCRIPT_DIR/state/diagnostic-page.html"
echo "  $SCRIPT_DIR/state/diagnostic-screenshot.png"
echo
echo "Send ALL FIVE files to Claude. The screenshot + summary together"
echo "will show whether MOCI is reachable or still 503-ing."
echo "------------------------------------------------------------------"
read -r -p "Press Enter to close..." _
