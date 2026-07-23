#!/bin/bash
# Bell.qa Qatar QFC — Daily Auto-Scan Installer
# Double-click to schedule the QFC scraper to run once a day.
# Re-run any time to update the schedule (e.g. after editing schedule.config).

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRAPER="$SCRIPT_DIR/scraper.py"
CONFIG="$SCRIPT_DIR/schedule.config"
REQS="$SCRIPT_DIR/requirements.txt"
VENV_DIR="$SCRIPT_DIR/.venv"
VENV_PY="$VENV_DIR/bin/python3"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.bell-qa.qfc-scraper.plist"
LABEL="com.bell-qa.qfc-scraper"

echo "=========================================================="
echo "   Bell.qa Qatar QFC — Daily Auto-Scan Installer"
echo "=========================================================="
echo

# 1. Verify scraper.py is co-located
if [ ! -f "$SCRAPER" ]; then
  echo "ERROR: Can't find scraper.py next to this installer."
  echo "Expected: $SCRAPER"
  read -r -p "Press Enter to close..." _
  exit 1
fi

# 2. Find a system Python 3
SYS_PY=""
for candidate in "$(command -v python3 2>/dev/null)" "/opt/homebrew/bin/python3" "/usr/local/bin/python3" "/usr/bin/python3"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    SYS_PY="$candidate"
    break
  fi
done

if [ -z "$SYS_PY" ]; then
  echo "ERROR: Python 3 is not installed."
  echo "On macOS, opening Terminal once and typing 'python3' will prompt"
  echo "you to install the Apple Command Line Tools (which include Python 3),"
  echo "or you can install Python from https://www.python.org/downloads/"
  read -r -p "Press Enter to close..." _
  exit 1
fi

echo "System Python:  $SYS_PY"

# 3. Build / refresh the project venv
if [ ! -x "$VENV_PY" ]; then
  echo "Creating Python virtual environment at .venv ..."
  "$SYS_PY" -m venv "$VENV_DIR"
fi

echo "Upgrading pip in venv ..."
"$VENV_PY" -m pip install --quiet --upgrade pip

echo "Installing scraper dependencies (requests, beautifulsoup4, lxml) ..."
"$VENV_PY" -m pip install --quiet -r "$REQS"
echo "  done."

# 4. Read time + max_run_minutes from schedule.config (defaults: 02:00, 360)
HOUR=2
MIN=0
MAX_MIN=360
DELAY_MIN=1.5
DELAY_MAX=3.5
FETCH_DETAILS=false
if [ -f "$CONFIG" ]; then
  TIME_LINE=$(grep -E '^[[:space:]]*time[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*time[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  if [ -n "$TIME_LINE" ]; then
    if [[ "$TIME_LINE" =~ ^([0-9]{1,2}):([0-9]{2})$ ]]; then
      HOUR=$((10#${BASH_REMATCH[1]}))
      MIN=$((10#${BASH_REMATCH[2]}))
    else
      echo "WARNING: schedule.config time='$TIME_LINE' is not HH:MM. Using default 02:00."
    fi
  fi
  MAX_LINE=$(grep -E '^[[:space:]]*max_run_minutes[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*max_run_minutes[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  if [[ "$MAX_LINE" =~ ^[0-9]+$ ]]; then
    if [ "$MAX_LINE" -ge 30 ]; then
      MAX_MIN="$MAX_LINE"
    else
      echo "WARNING: max_run_minutes=$MAX_LINE is too small. Using default 360."
    fi
  fi
  DMIN_LINE=$(grep -E '^[[:space:]]*delay_min[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*delay_min[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  DMAX_LINE=$(grep -E '^[[:space:]]*delay_max[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*delay_max[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]')
  if [[ "$DMIN_LINE" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then DELAY_MIN="$DMIN_LINE"; fi
  if [[ "$DMAX_LINE" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then DELAY_MAX="$DMAX_LINE"; fi
  FD_LINE=$(grep -E '^[[:space:]]*fetch_details[[:space:]]*=' "$CONFIG" | tail -n1 | sed -E 's/^[[:space:]]*fetch_details[[:space:]]*=[[:space:]]*//' | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
  if [ "$FD_LINE" = "true" ] || [ "$FD_LINE" = "1" ] || [ "$FD_LINE" = "yes" ]; then FETCH_DETAILS=true; fi
  if [ "$FD_LINE" = "false" ] || [ "$FD_LINE" = "0" ] || [ "$FD_LINE" = "no" ]; then FETCH_DETAILS=false; fi
fi

if (( HOUR < 0 || HOUR > 23 || MIN < 0 || MIN > 59 )); then
  echo "ERROR: schedule.config time is out of range. Use HH:MM (24-hour)."
  read -r -p "Press Enter to close..." _
  exit 1
fi

printf "Scraper:        %s\n" "$SCRAPER"
printf "Daily time:     %02d:%02d (local)\n" "$HOUR" "$MIN"
printf "Max minutes:    %d per run\n" "$MAX_MIN"
printf "Delay:          %s - %s seconds between requests\n" "$DELAY_MIN" "$DELAY_MAX"
printf "Fetch details:  %s\n" "$FETCH_DETAILS"
echo

# 5. Unload any prior version of the job
mkdir -p "$PLIST_DIR"
mkdir -p "$SCRIPT_DIR/scans" "$SCRIPT_DIR/state"

if [ -f "$PLIST_FILE" ]; then
  echo "Removing previous schedule..."
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
fi

# 6. Write the new LaunchAgent plist
cat > "$PLIST_FILE" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$VENV_PY</string>
        <string>$SCRAPER</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SCRAPE_MAX_MINUTES</key>
        <string>$MAX_MIN</string>
        <key>SCRAPE_DELAY_MIN</key>
        <string>$DELAY_MIN</string>
        <key>SCRAPE_DELAY_MAX</key>
        <string>$DELAY_MAX</string>
        <key>SCRAPE_FETCH_DETAILS</key>
        <string>$FETCH_DETAILS</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$SCRIPT_DIR</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MIN</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$SCRIPT_DIR/scans/scheduler.log</string>
    <key>StandardErrorPath</key>
    <string>$SCRIPT_DIR/scans/scheduler-error.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST_EOF

# 7. Load the schedule
launchctl load "$PLIST_FILE"

printf "\nDONE. The scraper will run every day at %02d:%02d (up to %d minutes per run).\n\n" "$HOUR" "$MIN" "$MAX_MIN"
echo "  Output folder:  $SCRIPT_DIR/scans/"
echo "  Latest file:    $SCRIPT_DIR/scans/qfc_companies_latest.json"
echo "  Schedule log:   $SCRIPT_DIR/scans/scheduler.log"
echo
echo "To run on demand:   double-click  'Run Scan Now.command'"
echo "To change time:     edit schedule.config in TextEdit, save,"
echo "                    then double-click this installer again."
echo "To turn it off:     double-click  'Uninstall Daily Auto-Scan.command'"
echo
read -r -p "Press Enter to close this window..." _
