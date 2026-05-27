#!/bin/bash
# Bell Data Intelligence — Uninstall ALL Scheduled Scans
#
# Removes the macOS LaunchAgents for all four directories (QFZ, QFC, MOCI,
# QSTP) in one click. Your scan output files and progress state are NOT
# touched — only the daily/weekly schedules are removed.
#
# Safe to re-run any time.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DIR_ROOT="$SCRIPT_DIR/Data/Companies/1. Data Gathering/Directories"

bar() { printf "==========================================================\n"; }

bar
echo "   Bell Data Intelligence — Remove ALL Scheduled Scans"
bar
echo
echo "Workspace: $SCRIPT_DIR"
echo

if [ ! -d "$DIR_ROOT" ]; then
  echo "ERROR: Can't find Directories folder at:"
  echo "  $DIR_ROOT"
  read -r -p "Press Enter to close..." _
  exit 1
fi

REMOVED=()
NOT_INSTALLED=()
FAILED=()

for DIR in "$DIR_ROOT"/QFZ "$DIR_ROOT"/QFC "$DIR_ROOT"/MOCI "$DIR_ROOT"/QSTP; do
  NAME="$(basename "$DIR")"
  UNINSTALLER="$DIR/Uninstall Daily Auto-Scan.command"

  echo "----------------------------------------------------------"
  echo "  $NAME"
  echo "----------------------------------------------------------"

  if [ ! -f "$UNINSTALLER" ]; then
    echo "  SKIP: no Uninstall Daily Auto-Scan.command found"
    FAILED+=("$NAME (no uninstaller)")
    echo
    continue
  fi

  OUTPUT_LOG="$SCRIPT_DIR/Operations/run_logs/uninstall_${NAME}.log"
  mkdir -p "$SCRIPT_DIR/Operations/run_logs"
  printf '\n' | bash "$UNINSTALLER" >"$OUTPUT_LOG" 2>&1

  if grep -qi "schedule removed\|will no longer auto-run" "$OUTPUT_LOG"; then
    REMOVED+=("$NAME")
    echo "  ✓ removed"
  elif grep -qi "nothing to remove\|no .* schedule is installed" "$OUTPUT_LOG"; then
    NOT_INSTALLED+=("$NAME")
    echo "  · already unscheduled (nothing to remove)"
  else
    FAILED+=("$NAME (unexpected output — see log)")
    echo "  ✗ failed (see Operations/run_logs/uninstall_${NAME}.log)"
  fi
  echo
done

bar
echo "   Summary"
bar
echo
echo "Removed:         ${#REMOVED[@]}"
for n in "${REMOVED[@]}";        do echo "  ✓ $n"; done
echo "Already off:     ${#NOT_INSTALLED[@]}"
for n in "${NOT_INSTALLED[@]}";  do echo "  · $n"; done
if [ ${#FAILED[@]} -gt 0 ]; then
  echo
  echo "Problems:        ${#FAILED[@]}"
  for n in "${FAILED[@]}";       do echo "  ✗ $n"; done
fi
echo
echo "Your scans/ and state/ folders are untouched."
echo "When you want to re-enable scheduling, double-click each directory's"
echo "  'Install Daily Auto-Scan.command'  (or the top-level reinstall wrapper)."
echo
read -r -p "Press Enter to close..." _
