#!/bin/bash
# Bell Data Intelligence — Check the Always-On Engine SERVICE (read-only)
#
# The engine writes a heartbeat every 45s. If the dashboard says "Stopped (no
# recent heartbeat)" the background service (launchd agent) is not running.
# This prints WHY: whether launchd knows the job, its last exit status, whether
# the log files are being written, and whether node can even read the engine.
# Nothing is changed.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/continuous_sweep.js"
LABEL="com.bell-qa.continuous-engine"
PLIST_FILE="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/bell-qa"                 # new location (always writable)
ALT_LOG_DIR="$SCRIPT_DIR/Operations/run_logs"        # old location (may be blocked on Desktop)

echo "Bell — Always-On Engine service check"
echo "====================================="
echo

echo "1) Engine script"
if [ -r "$SCRIPT" ]; then echo "   readable: YES   $SCRIPT"
else echo "   readable: NO    $SCRIPT   ← node cannot read it"; fi

echo
echo "2) Node.js"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
echo "   node: ${NODE_BIN:-NOT FOUND}"

echo
echo "3) LaunchAgent plist"
if [ -f "$PLIST_FILE" ]; then echo "   exists: YES   $PLIST_FILE"
else echo "   exists: NO    ← run 'Install Always-On Engine.command'"; fi

echo
echo "4) Is launchd running the job?"
if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
  launchctl print "gui/$UID/$LABEL" 2>/dev/null | grep -E "state|pid|last exit code|last exit status|program|runs" | sed 's/^/   /'
else
  echo "   launchd does NOT have this job loaded."
  echo "   (older syntax check:)"
  launchctl list 2>/dev/null | grep -i "bell-qa" | sed 's/^/   /' || echo "   nothing matching bell-qa"
fi

echo
echo "5) Log files (is it writing?)"
for d in "$LOG_DIR" "$ALT_LOG_DIR"; do
  for f in "$d/continuous_engine.log" "$d/continuous_engine-error.log"; do
    if [ -f "$f" ]; then
      echo "   $(date -r "$f" '+%Y-%m-%d %H:%M')  $f"
    fi
  done
done
for d in "$LOG_DIR" "$ALT_LOG_DIR"; do
  [ -f "$d/continuous_engine.log" ] || [ -f "$d/continuous_engine-error.log" ] || continue
  echo
  echo "   --- $d ---"
  echo "   last 3 lines of the engine log:"
  tail -3 "$d/continuous_engine.log" 2>/dev/null | sed 's/^/     /' || echo "     (none)"
  echo "   last 3 lines of the ERROR log:"
  tail -3 "$d/continuous_engine-error.log" 2>/dev/null | sed 's/^/     /' || echo "     (none)"
done

echo
echo "6) HOW MANY engine processes are actually running?"
# Count ONLY the node processes. `caffeinate -i node …script` carries the script
# path in its own command line, so a plain `pgrep -f` double-counts the wrapper
# and reports a phantom second engine (false alarm hit 2026-07-10).
engine_pids() {
  pgrep -f 'continuous_sweep\.js' 2>/dev/null | while read -r p; do
    case "$(ps -o comm= -p "$p" 2>/dev/null)" in *node) echo "$p";; esac
  done
}
PIDS="$(engine_pids)"
COUNT=0
[ -n "$PIDS" ] && COUNT="$(printf '%s\n' "$PIDS" | wc -l | tr -d ' ')"

if [ "$COUNT" -eq 0 ]; then
  echo "   0 — the engine is NOT running."
elif [ "$COUNT" -eq 1 ]; then
  echo "   1 ✓ correct (node pid $PIDS)"
else
  echo "   $COUNT ⚠⚠ TOO MANY — two engines sweep the same companies, exhaust the"
  echo "   Postgres pool and double the browser memory. Run 'Stop All Engines.command',"
  echo "   then 'Install Always-On Engine.command'."
  # shellcheck disable=SC2046
  ps -o pid,etime,command -p $(printf '%s' "$PIDS" | tr '\n' ' ') 2>/dev/null | sed 's/^/     /'
fi

echo
echo "READING THIS:"
echo "  • 'last exit code' non-zero  → the engine starts and dies; the error log says why."
echo "  • job not loaded             → re-run 'Install Always-On Engine.command'."
echo "  • script not readable, or logs never update → macOS is blocking a background"
echo "    job from your Desktop folder. Use 'Start Engine (foreground).command' —"
echo "    it runs the engine in a normal Terminal window, which always has access."
echo
read -r -p "Press Enter to close this window..." _
