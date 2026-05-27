#!/bin/bash
# Bell Data Intelligence — Portal launcher
#
# Double-click to:
#   1. Make sure Postgres.app is running
#   2. Install Portal server dependencies (first-run only, ~15s)
#   3. Start the Portal at  http://localhost:3939
#   4. Open the Portal in your default browser
#
# To stop:  close this Terminal window.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
PORT="${PORT:-3939}"
HOST="127.0.0.1"
PG_APP_PATH="/Applications/Postgres.app"

bar() { printf "==========================================================\n"; }

bar
echo "   Bell Data Intelligence — Portal"
bar
echo
echo "Workspace: $SCRIPT_DIR"
echo

# -----------------------------------------------------------------------------
# 1. Locate Node.js
# -----------------------------------------------------------------------------
NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is not installed."
  echo "Install from https://nodejs.org (LTS .pkg installer), then re-run."
  read -r -p "Press Enter to close..." _
  exit 1
fi
NPM_BIN="$(dirname "$NODE_BIN")/npm"

echo "Node.js: $NODE_BIN"

# -----------------------------------------------------------------------------
# 2. Make sure Postgres.app is running
# -----------------------------------------------------------------------------
if [ ! -d "$PG_APP_PATH" ]; then
  echo
  echo "ERROR: Postgres.app is not installed."
  echo "Double-click 'Setup Postgres.command' first."
  read -r -p "Press Enter to close..." _
  exit 1
fi

PSQL=""
for cand in "$PG_APP_PATH"/Contents/Versions/latest/bin/psql "$PG_APP_PATH"/Contents/Versions/*/bin/psql; do
  if [ -x "$cand" ]; then PSQL="$cand"; break; fi
done

if [ -n "$PSQL" ] && ! "$PSQL" -h localhost -U "$USER" -d postgres -tAc "SELECT 1;" >/dev/null 2>&1; then
  echo "Starting Postgres.app..."
  open -a "Postgres"
  for i in $(seq 1 30); do
    sleep 1
    "$PSQL" -h localhost -U "$USER" -d postgres -tAc "SELECT 1;" >/dev/null 2>&1 && break
    if [ "$i" -eq 30 ]; then
      echo
      echo "ERROR: Postgres didn't start within 30 seconds."
      echo "Open Postgres.app manually, click 'Start' on its server, then re-run."
      read -r -p "Press Enter to close..." _
      exit 1
    fi
  done
fi
echo "Postgres: ready."

# -----------------------------------------------------------------------------
# 3. Install server dependencies if needed
# -----------------------------------------------------------------------------
if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo
  echo "First-time setup: installing Portal dependencies (~15-30s)..."
  ( cd "$SERVER_DIR" && "$NPM_BIN" install --omit=dev --no-audit --no-fund --silent ) || {
    echo "ERROR: npm install failed. See output above."
    read -r -p "Press Enter to close..." _
    exit 1
  }
  echo "Dependencies installed."
fi

# -----------------------------------------------------------------------------
# 4. Free the port if a stale server is hogging it
# -----------------------------------------------------------------------------
STALE_PID="$(lsof -ti tcp:$PORT 2>/dev/null || true)"
if [ -n "$STALE_PID" ]; then
  echo "Stopping stale server on port $PORT (pid $STALE_PID)..."
  kill "$STALE_PID" 2>/dev/null || true
  sleep 1
fi

# -----------------------------------------------------------------------------
# 5. Start the server in the background, wait for healthcheck, open browser
# -----------------------------------------------------------------------------
LOG_DIR="$SCRIPT_DIR/Operations/run_logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/portal-$(date +%Y%m%d-%H%M%S).log"

echo
echo "Starting Portal at http://${HOST}:${PORT} ..."
echo "  log: $LOG_FILE"
echo

( cd "$SERVER_DIR" && PORT="$PORT" HOST="$HOST" "$NODE_BIN" server.js ) > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Wait for /api/health to respond
HEALTH_OK=0
for i in $(seq 1 30); do
  sleep 0.5
  if curl -sf "http://${HOST}:${PORT}/api/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
done

if [ "$HEALTH_OK" -ne 1 ]; then
  echo
  echo "ERROR: Portal failed to start. Last 30 lines of log:"
  echo "----------------------------------------------------------"
  tail -30 "$LOG_FILE"
  echo "----------------------------------------------------------"
  read -r -p "Press Enter to close..." _
  exit 1
fi

# Open in default browser
open "http://${HOST}:${PORT}"

bar
echo "   Portal is running"
bar
echo
echo "   URL:    http://${HOST}:${PORT}"
echo "   Stop:   close this Terminal window"
echo "   Log:    $LOG_FILE"
echo
echo "Streaming server log below — Ctrl+C or close the window to stop."
echo

# Make sure the server dies when we close this window
trap 'kill "$SERVER_PID" 2>/dev/null; exit 0' INT TERM EXIT

# Follow the log so the user sees activity
tail -f "$LOG_FILE"
