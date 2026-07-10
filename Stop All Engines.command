#!/bin/bash
# Bell Data Intelligence — Stop ALL enrichment engines (clean slate)
#
# Use this when more than one engine is running (Check Engine Service.command
# says "TOO MANY"). Two engines sweep the SAME companies: they exhaust the
# Postgres connection pool ("timeout exceeded when trying to connect") and run
# two sets of browsers on your Mac's memory.
#
# This stops the background service AND any engine left running in a Terminal
# window, then verifies zero remain. Nothing else is touched — no data changes.
# Afterwards run "Install Always-On Engine.command" to start exactly one.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LABEL="com.bell-qa.continuous-engine"
PLIST_FILE="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Stopping every Bell enrichment engine…"
echo

# 1) Stop the LaunchAgent service (so KeepAlive can't resurrect it mid-cleanup).
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null && echo "  ✓ background service stopped" || echo "  · background service was not running"
launchctl unload "$PLIST_FILE" 2>/dev/null || true

# Only NODE processes are engines. `caffeinate -i node …script` also carries the
# script path on its command line, so matching it would double-count (and the
# empty-match count produced "0\n0" → "integer expression expected").
engine_pids() {
  pgrep -f 'continuous_sweep\.js' 2>/dev/null | while read -r p; do
    case "$(ps -o comm= -p "$p" 2>/dev/null)" in *node) echo "$p";; esac
  done
}
count_engines() {
  local pids; pids="$(engine_pids)"
  if [ -z "$pids" ]; then echo 0; else printf '%s\n' "$pids" | wc -l | tr -d ' '; fi
}

# 2) Kill any remaining engine processes (foreground Terminal runs, strays).
sleep 1
PIDS="$(engine_pids)"
if [ -n "$PIDS" ]; then
  echo "  · found engine process(es): $(printf '%s' "$PIDS" | tr '\n' ' ')"
  # Ask politely first — the engine handles SIGTERM and finishes its row.
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null || true
  sleep 4
  STILL="$(engine_pids)"
  if [ -n "$STILL" ]; then
    echo "  · still alive, forcing…"
    # shellcheck disable=SC2086
    kill -9 $STILL 2>/dev/null || true
    sleep 1
  fi
fi
# Clean up the caffeinate wrapper if it outlived its child.
pkill -f 'caffeinate -i .*continuous_sweep\.js' 2>/dev/null || true

# 3) Verify.
LEFT="$(count_engines)"
echo
if [ "$LEFT" -eq 0 ]; then
  echo "✓ All engines stopped. 0 running."
  echo
  echo "  Start exactly one:  double-click 'Install Always-On Engine.command'"
else
  echo "⚠ $LEFT engine process(es) still running. Run 'Check Engine Service.command'"
  echo "  and send the output to Claude."
fi

echo
read -r -p "Press Enter to close this window..." _
