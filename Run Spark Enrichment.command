#!/bin/bash
# DEEP-ENRICH companies with Firecrawl's research agent — 5 FREE runs per day.
#
# Each run submits a batch of companies (~120, self-adjusting) and the agent scours the web
# for EVERYTHING about each one: emails, phones, WhatsApp, social pages, addresses/branches,
# registration, leadership, owners, stated financials, partnerships, reviews, news — plus any
# RELATED companies it discovers along the way (Qatar ones become candidates to add; non-Qatar
# ones are kept admin-only for future Middle-East expansion).
#
# Every fact is source-attributed; nothing is invented; unfindable stays honestly empty.
# Submission is tracked per company, so over the days EVERY company goes through.
#
# Runs the day's free budget (up to 5 runs, ~10-40 min total). RESUMABLE: close any time and
# re-run — it continues where it stopped. All data stays on this Mac until you push.
#
# FIRST TIME: double-click "Open Bell.qa Portal.command" once BEFORE this (database upgrade).
#
# Double-click to run.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for cand in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then echo "Could not find node. Install Node.js first."; read -r -p "Press Enter to close. "; exit 1; fi

cd "$SERVER_DIR" || exit 1
"$NODE_BIN" scripts/run_spark.js

echo
read -r -p "Press Enter to close this window... "
