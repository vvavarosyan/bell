#!/bin/bash
# Bell Data Intelligence — RESTART the local Portal cleanly.
#
# Use this instead of just closing the Portal window. Closing the window does NOT
# always stop the server — a leftover copy can keep holding port 3939, so the
# Portal keeps serving OLD code even after you "restart" it (exactly what happened
# 2026-07-21). This stops every copy first, then starts one fresh.
#
# Double-click to run.
set -u
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PORT="${PORT:-3939}"

echo "Bell — restarting the local Portal"
echo "=================================="
echo

echo "1) Stopping anything already using port $PORT…"
PIDS="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null || true)"
if [ -n "$PIDS" ]; then
  echo "   found: $PIDS"
  for p in $PIDS; do kill "$p" 2>/dev/null || true; done
  sleep 2
  # Anything stubborn gets a firm stop.
  PIDS2="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null || true)"
  for p in $PIDS2; do kill -9 "$p" 2>/dev/null || true; done
  sleep 1
  echo "   stopped."
else
  echo "   nothing was running."
fi

# Also clear any stray Portal server copies that lost the port.
STRAY="$(pgrep -f "node .*Portal/server/server.js" 2>/dev/null || true)"
if [ -n "$STRAY" ]; then
  echo "2) Clearing stray Portal copies: $STRAY"
  for p in $STRAY; do kill "$p" 2>/dev/null || true; done
  sleep 1
else
  echo "2) No stray copies."
fi

echo "3) Starting the Portal fresh…"
echo
exec "$SCRIPT_DIR/Open Bell.qa Portal.command"
