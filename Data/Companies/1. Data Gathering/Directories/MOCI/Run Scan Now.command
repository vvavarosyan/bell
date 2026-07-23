#!/bin/bash
# Bell.qa Qatar MOCI — run / resume the production scrape now.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VENV_PY="$SCRIPT_DIR/.venv/bin/python3"
SCRAPER="$SCRIPT_DIR/scraper.py"
CONFIG="$SCRIPT_DIR/schedule.config"

if [ ! -x "$VENV_PY" ]; then
  echo "ERROR: Python virtualenv not found at .venv/"
  echo "Double-click 'Install Daily Auto-Scan.command' first."
  read -r -p "Press Enter to close..." _; exit 1
fi

# Mirror config-reading from the install script so on-demand runs use
# the same knobs.
MAX_MIN=720; ACTIVE_ONLY=true; INCLUDE_PRO=true; FETCH_DETAILS=true
SCROLL_PAUSE=1.0; DETAIL_PAUSE=1.5; HEADLESS=true
MANUAL=false
if [ -f "$CONFIG" ]; then
  CFG_VAL() { grep -E "^[[:space:]]*$1[[:space:]]*=" "$CONFIG" | tail -n1 | sed -E "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//" | tr -d '[:space:]'; }
  V=$(CFG_VAL max_run_minutes); [[ "$V" =~ ^[0-9]+$ ]] && [ "$V" -ge 30 ] && MAX_MIN="$V"
  V=$(CFG_VAL active_only | tr '[:upper:]' '[:lower:]'); [ "$V" = "false" ] && ACTIVE_ONLY=false
  V=$(CFG_VAL include_professional_license | tr '[:upper:]' '[:lower:]'); [ "$V" = "false" ] && INCLUDE_PRO=false
  V=$(CFG_VAL fetch_details | tr '[:upper:]' '[:lower:]'); [ "$V" = "false" ] && FETCH_DETAILS=false
  V=$(CFG_VAL scroll_pause); [[ "$V" =~ ^[0-9]+(\.[0-9]+)?$ ]] && SCROLL_PAUSE="$V"
  V=$(CFG_VAL detail_pause); [[ "$V" =~ ^[0-9]+(\.[0-9]+)?$ ]] && DETAIL_PAUSE="$V"
  V=$(CFG_VAL headless | tr '[:upper:]' '[:lower:]'); [ "$V" = "false" ] && HEADLESS=false
  V=$(CFG_VAL manual | tr '[:upper:]' '[:lower:]'); [ "$V" = "true" ] && MANUAL=true
fi

cd "$SCRIPT_DIR"
SCRAPE_MODE=production \
SCRAPE_MAX_MINUTES="$MAX_MIN" \
SCRAPE_ACTIVE_ONLY="$ACTIVE_ONLY" \
SCRAPE_INCLUDE_PRO_LICENSE="$INCLUDE_PRO" \
SCRAPE_FETCH_DETAILS="$FETCH_DETAILS" \
SCRAPE_SCROLL_PAUSE="$SCROLL_PAUSE" \
SCRAPE_DETAIL_PAUSE="$DETAIL_PAUSE" \
SCRAPE_HEADLESS="$HEADLESS" \
SCRAPE_MANUAL="$MANUAL" \
  "$VENV_PY" "$SCRAPER"

echo
read -r -p "Done. Press Enter to close..." _
