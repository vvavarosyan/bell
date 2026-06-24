#!/bin/bash
# Restart the Bell Crawl4AI engine (picks up the latest server code, e.g. the
# warm-browser fix). Fast — does NOT reinstall. Double-click to run.
set -u
PLIST="$HOME/Library/LaunchAgents/com.bell-qa.crawl4ai.plist"
PORT="${BELL_CRAWL4AI_PORT:-11235}"

if [ ! -f "$PLIST" ]; then
  echo "Crawl4AI isn't installed yet."
  echo "Double-click 'Install Crawl4AI Engine.command' first."
  read -p "Press Enter to close..."; exit 1
fi

echo "> Restarting the Crawl4AI engine..."
launchctl unload "$PLIST" 2>/dev/null || true
sleep 1
launchctl load "$PLIST" 2>/dev/null || true

echo "> Waiting for it to come up (one warm browser, no more dock flicker)..."
ok=""
for i in $(seq 1 15); do
  sleep 2
  if curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"ok": *true'; then ok=1; break; fi
done

echo
if [ -n "$ok" ]; then
  echo "OK  Crawl4AI restarted and healthy. It now keeps ONE browser running"
  echo "    instead of opening a new one per page — the dock flicker stops."
else
  echo "!!  Not healthy yet — check  $HOME/.bell-crawl4ai/server.err"
  echo "    (Bell keeps harvesting with its built-in renderer meanwhile.)"
fi
echo
read -p "Press Enter to close..."
