#!/bin/bash
# Bell Data Intelligence — Backfill Full Tender Archive
#
# ONE-TIME (or occasional) deep pull of Monaqasat's ENTIRE awarded history
# (~1,169 pages ≈ 23,000 tenders) plus every open tender, with FULL detail —
# activity codes, procurement contact, contract terms — for each one.
#
# This is the big one. It opens tens of thousands of pages, several in parallel,
# so it takes a while — roughly 2–4 hours depending on the site and your
# connection. It is RESUMABLE: if it stops (you close the window, the Mac
# sleeps, Crawl4AI hiccups), just double-click it again and it picks up exactly
# where it left off, skipping everything already done.
#
# Needs the Crawl4AI engine running the whole time. If nothing comes back, run
# "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command" first.
#
# For the quick day-to-day refresh (open tenders + recent awards), use
# "Run Tender Scan.command" instead — this one is only for the full history.
#
# Optional: set BELL_TENDER_CONCURRENCY (default 6, max 12) to open more or
# fewer detail pages at once — higher is faster but heavier on the site.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/backfill_tenders.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "Backfilling the full Qatar tender archive (Monaqasat)…"
echo "This can take a few hours. It is safe to stop and re-run — it resumes."
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
