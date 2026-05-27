#!/bin/bash
# Bell Data Intelligence — Reinstall All Scheduled Scans
#
# After moving folders or renaming the workspace, the macOS LaunchAgents that
# run your nightly scrapes still point at the OLD locations. Double-click this
# file ONCE to refresh all four (QFZ, QFC, MOCI, QSTP) so they point at the
# current paths.
#
# Safe to re-run at any time.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DIR_ROOT="$SCRIPT_DIR/Data/Companies/1. Data Gathering/Directories"

bar() { printf "==========================================================\n"; }

bar
echo "   Bell Data Intelligence — Refresh ALL Daily Scans"
bar
echo
echo "Workspace: $SCRIPT_DIR"
echo

if [ ! -d "$DIR_ROOT" ]; then
  echo "ERROR: Can't find Directories folder at:"
  echo "  $DIR_ROOT"
  echo
  echo "Are you running this from the Bell Data Intelligence root?"
  read -r -p "Press Enter to close..." _
  exit 1
fi

FAILURES=()
SUCCESSES=()

for DIR in "$DIR_ROOT"/QFZ "$DIR_ROOT"/QFC "$DIR_ROOT"/MOCI "$DIR_ROOT"/QSTP; do
  NAME="$(basename "$DIR")"
  INSTALLER="$DIR/Install Daily Auto-Scan.command"

  echo "----------------------------------------------------------"
  echo "  $NAME"
  echo "----------------------------------------------------------"

  if [ ! -f "$INSTALLER" ]; then
    echo "  SKIP: no Install Daily Auto-Scan.command found"
    FAILURES+=("$NAME (no installer)")
    echo
    continue
  fi

  # Run each installer, capturing all output. We feed an empty newline so the
  # installer's "Press Enter" prompt completes without hanging AND without
  # tripping `set -e` on EOF (which is what made the previous version of this
  # wrapper falsely report failures).
  OUTPUT_LOG="$SCRIPT_DIR/Operations/run_logs/reinstall_${NAME}.log"
  mkdir -p "$SCRIPT_DIR/Operations/run_logs"
  printf '\n' | bash "$INSTALLER" >"$OUTPUT_LOG" 2>&1
  INSTALLER_EXIT=$?

  # The installer may exit 1 even on success (read-EOF under set -e). The real
  # signal is whether it printed the success line, so check for that.
  if grep -qiE "scraper will run|^DONE\.?" "$OUTPUT_LOG" 2>/dev/null; then
    SUCCESSES+=("$NAME")
    echo "  ✓ $NAME — scheduled (see Operations/run_logs/reinstall_${NAME}.log)"
  else
    FAILURES+=("$NAME (exit=$INSTALLER_EXIT — see log)")
    echo "  ✗ $NAME — failed, exit=$INSTALLER_EXIT"
    echo "    Log: Operations/run_logs/reinstall_${NAME}.log"
  fi
  echo
done

bar
echo "   Summary"
bar
echo
echo "Reinstalled: ${#SUCCESSES[@]}"
for s in "${SUCCESSES[@]}"; do echo "  ✓ $s"; done
echo
if [ ${#FAILURES[@]} -gt 0 ]; then
  echo "Problems:    ${#FAILURES[@]}"
  for f in "${FAILURES[@]}"; do echo "  ✗ $f"; done
  echo
fi
echo "Done. You can close this window."
echo
read -r -p "Press Enter to close..." _
