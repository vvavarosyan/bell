#!/bin/bash
# Bell.qa Qatar MOCI — Install / Update weekly schedule
# Re-run any time to apply changes from schedule.config.
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SCRAPER="$SCRIPT_DIR/scraper.py"
CONFIG="$SCRIPT_DIR/schedule.config"
REQS="$SCRIPT_DIR/requirements.txt"
VENV_DIR="$SCRIPT_DIR/.venv"
VENV_PY="$VENV_DIR/bin/python3"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.bell-qa.moci-scraper.plist"
LABEL="com.bell-qa.moci-scraper"

echo "================================================================"
echo "   Bell.qa Qatar MOCI — Install / Update Weekly Schedule"
echo "================================================================"
echo

# 1. Find Python 3
SYS_PY=""
for candidate in "$(command -v python3 2>/dev/null)" "/opt/homebrew/bin/python3" "/usr/local/bin/python3" "/usr/bin/python3"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    SYS_PY="$candidate"
    break
  fi
done
if [ -z "$SYS_PY" ]; then
  echo "ERROR: Python 3 is not installed."
  echo "Install Python from https://www.python.org/downloads/ and re-run."
  read -r -p "Press Enter to close..." _; exit 1
fi
echo "Python:    $SYS_PY"

# 2. Create / refresh venv
if [ ! -x "$VENV_PY" ]; then
  echo "Creating Python virtual environment at .venv ..."
  "$SYS_PY" -m venv "$VENV_DIR"
fi

echo "Upgrading pip ..."
"$VENV_PY" -m pip install --quiet --upgrade pip

echo "Installing scraper dependencies (playwright, lxml) ..."
"$VENV_PY" -m pip install --quiet -r "$REQS"

# 3. Install Chromium browser (one-time, ~150 MB). Skips if already present.
echo "Installing Chromium browser for Playwright (one-time download, ~150 MB)..."
"$VENV_PY" -m playwright install chromium
echo "  done."

# 4. Read schedule.config (day, time, max_run_minutes, flags)
DAY=sun
HOUR=2; MIN=0; MAX_MIN=720
ACTIVE_ONLY=true
INCLUDE_PRO=true
FETCH_DETAILS=true
SCROLL_PAUSE=1.0
DETAIL_PAUSE=1.5
HEADLESS=true

if [ -f "$CONFIG" ]; then
  CFG_VAL() { grep -E "^[[:space:]]*$1[[:space:]]*=" "$CONFIG" | tail -n1 | sed -E "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//" | tr -d '[:space:]'; }
  V=$(CFG_VAL day); [ -n "$V" ] && DAY=$(echo "$V" | tr '[:upper:]' '[:lower:]')
  V=$(CFG_VAL time)
  if [[ "$V" =~ ^([0-9]{1,2}):([0-9]{2})$ ]]; then
    HOUR=$((10#${BASH_REMATCH[1]})); MIN=$((10#${BASH_REMATCH[2]}))
  fi
  V=$(CFG_VAL max_run_minutes); [[ "$V" =~ ^[0-9]+$ ]] && [ "$V" -ge 30 ] && MAX_MIN="$V"
  V=$(CFG_VAL active_only | tr '[:upper:]' '[:lower:]'); [ "$V" = "false" ] && ACTIVE_ONLY=false
  V=$(CFG_VAL include_professional_license | tr '[:upper:]' '[:lower:]'); [ "$V" = "false" ] && INCLUDE_PRO=false
  V=$(CFG_VAL fetch_details | tr '[:upper:]' '[:lower:]'); [ "$V" = "false" ] && FETCH_DETAILS=false
  V=$(CFG_VAL scroll_pause); [[ "$V" =~ ^[0-9]+(\.[0-9]+)?$ ]] && SCROLL_PAUSE="$V"
  V=$(CFG_VAL detail_pause); [[ "$V" =~ ^[0-9]+(\.[0-9]+)?$ ]] && DETAIL_PAUSE="$V"
  V=$(CFG_VAL headless | tr '[:upper:]' '[:lower:]'); [ "$V" = "false" ] && HEADLESS=false
fi

# Day-of-week to launchd Weekday integer (0=Sunday)
case "$DAY" in
  sun|sunday|daily) DOW=0 ;;
  mon|monday) DOW=1 ;;
  tue|tuesday) DOW=2 ;;
  wed|wednesday) DOW=3 ;;
  thu|thursday) DOW=4 ;;
  fri|friday) DOW=5 ;;
  sat|saturday) DOW=6 ;;
  *) DOW=0; echo "WARNING: unknown day '$DAY', defaulting to Sunday." ;;
esac

# If user picked "daily", we emit a different StartCalendarInterval (no Weekday)
SCHED_INTERVAL_XML="<key>Weekday</key><integer>$DOW</integer><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MIN</integer>"
if [ "$DAY" = "daily" ]; then
  SCHED_INTERVAL_XML="<key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MIN</integer>"
fi

echo
printf "Scrape:    %s\n" "$SCRAPER"
printf "Day:       %s\n" "$DAY"
printf "Time:      %02d:%02d (local)\n" "$HOUR" "$MIN"
printf "Max min:   %d per run\n" "$MAX_MIN"
printf "Active:    %s, Pro Licence: %s, Details: %s\n" "$ACTIVE_ONLY" "$INCLUDE_PRO" "$FETCH_DETAILS"
echo

# 5. Unload existing plist (if any)
mkdir -p "$PLIST_DIR"
mkdir -p "$SCRIPT_DIR/scans" "$SCRIPT_DIR/state"
if [ -f "$PLIST_FILE" ]; then
  echo "Removing previous schedule..."
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
fi

# 6. Write new plist
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
        <key>SCRAPE_MODE</key>
        <string>production</string>
        <key>SCRAPE_MAX_MINUTES</key>
        <string>$MAX_MIN</string>
        <key>SCRAPE_ACTIVE_ONLY</key>
        <string>$ACTIVE_ONLY</string>
        <key>SCRAPE_INCLUDE_PRO_LICENSE</key>
        <string>$INCLUDE_PRO</string>
        <key>SCRAPE_FETCH_DETAILS</key>
        <string>$FETCH_DETAILS</string>
        <key>SCRAPE_SCROLL_PAUSE</key>
        <string>$SCROLL_PAUSE</string>
        <key>SCRAPE_DETAIL_PAUSE</key>
        <string>$DETAIL_PAUSE</string>
        <key>SCRAPE_HEADLESS</key>
        <string>$HEADLESS</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>$SCRIPT_DIR</string>
    <key>StartCalendarInterval</key>
    <dict>
        $SCHED_INTERVAL_XML
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

launchctl load "$PLIST_FILE"

printf "\nDONE.\n\n"
if [ "$DAY" = "daily" ]; then
  printf "Scraper will run EVERY DAY at %02d:%02d.\n" "$HOUR" "$MIN"
else
  printf "Scraper will run every %s at %02d:%02d.\n" "$DAY" "$HOUR" "$MIN"
fi
echo
echo "Next steps:"
echo "  1. Double-click  'Diagnose MOCI.command'  to capture the live"
echo "     Power BI traffic and send it to Claude (one-time setup)."
echo "  2. Once Claude finalises the parser, double-click"
echo "     'Run Scan Now.command' to run the real scrape on demand."
echo
read -r -p "Press Enter to close..." _
