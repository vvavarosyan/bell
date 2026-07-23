#!/bin/bash
# Bell.qa Qatar QFC — run / resume the scraper right now.
# A single click runs the scraper as long as max_run_minutes allows;
# if interrupted, just double-click again to resume.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VENV_PY="$SCRIPT_DIR/.venv/bin/python3"
SCRAPER="$SCRIPT_DIR/scraper.py"
CONFIG="$SCRIPT_DIR/schedule.config"

if [ ! -x "$VENV_PY" ]; then
  echo "ERROR: Python virtualenv not found at .venv/"
  echo "Please double-click 'Install Daily Auto-Scan.command' first to set it up."
  echo "(That installer creates the venv and installs dependencies.)"
  read -r -p "Press Enter to close..." _
  exit 1
fi

# Read knobs from schedule.config if present
MAX_MIN=360
DELAY_MIN=1.5
DELAY_MAX=3.5
FETCH_DETAILS=false
if [ -f "$CONFIG" ]; then
  MAX_LINE=$(grep -E '^[[:space:]]*max_run_minutes[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*max_run_minutes[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  if [[ "$MAX_LINE" =~ ^[0-9]+$ ]] && [ "$MAX_LINE" -ge 30 ]; then
    MAX_MIN="$MAX_LINE"
  fi
  DMIN_LINE=$(grep -E '^[[:space:]]*delay_min[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*delay_min[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  DMAX_LINE=$(grep -E '^[[:space:]]*delay_max[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*delay_max[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  if [[ "$DMIN_LINE" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then DELAY_MIN="$DMIN_LINE"; fi
  if [[ "$DMAX_LINE" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then DELAY_MAX="$DMAX_LINE"; fi
  FD_LINE=$(grep -E '^[[:space:]]*fetch_details[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*fetch_details[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
  if [ "$FD_LINE" = "true" ] || [ "$FD_LINE" = "1" ] || [ "$FD_LINE" = "yes" ]; then FETCH_DETAILS=true; fi
fi

cd "$SCRIPT_DIR"
SCRAPE_MAX_MINUTES="$MAX_MIN" \
SCRAPE_DELAY_MIN="$DELAY_MIN" \
SCRAPE_DELAY_MAX="$DELAY_MAX" \
SCRAPE_FETCH_DETAILS="$FETCH_DETAILS" \
  "$VENV_PY" "$SCRAPER"

echo
read -r -p "Done. Press Enter to close this window..." _
