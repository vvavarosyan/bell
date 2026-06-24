#!/bin/bash
# Quick health + live test for Bell's local Crawl4AI scraping engine.
# Double-click to run. Tells you if it's WORKING and shows any error.
set -u
PORT="${BELL_CRAWL4AI_PORT:-11235}"
URL="http://127.0.0.1:$PORT"

echo "=================================="
echo "   Bell · Crawl4AI engine — test"
echo "=================================="
echo
echo "> Checking engine health at $URL ..."
H="$(curl -s "$URL/health" 2>/dev/null || true)"

if [ -z "$H" ]; then
  echo "X  No response. The engine isn't running."
  echo "   Double-click 'Install Crawl4AI Engine.command' first."
  echo
  read -p "Press Enter to close..."; exit 1
fi
echo "   health: $H"
echo

case "$H" in
  *'"ok": true'*|*'"ok":true'*)
    echo "> Engine is ready. Running a live test crawl (https://example.com)..."
    R="$(curl -s -X POST "$URL/crawl" -H 'Content-Type: application/json' -d '{"url":"https://example.com"}' 2>/dev/null || true)"
    case "$R" in
      *'"ok": true'*|*'"ok":true'*)
        LEN=$(printf '%s' "$R" | wc -c | tr -d ' ')
        echo
        echo "OK  WORKING — the test crawl returned $LEN bytes."
        echo "    Crawl4AI is live; the harvester will use it for JS-heavy sites."
        ;;
      *)
        echo
        echo "!!  Engine is up but the test crawl failed. It returned:"
        printf '%s\n' "$R" | sed 's/^/      /'
        ;;
    esac
    ;;
  *)
    echo "X  Engine is running but crawl4ai isn't ready (see \"error\" above)."
    echo "   Most common cause: Python older than 3.10."
    echo "   Re-run 'Install Crawl4AI Engine.command' — it now finds a newer Python."
    ;;
esac
echo
read -p "Press Enter to close..."
