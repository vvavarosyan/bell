#!/bin/bash
# Bell Data Intelligence — Read Qatar's job boards now
#
# Reads every vacancy board Bell can read: the national career portal, the
# classifieds board, the Oracle-hosted employer boards, and every company
# careers page that publishes its vacancies in a machine-readable form.
#
# It also CLOSES vacancies that have gone — but only ever from a board that was
# read successfully, and only after two clean reads in a row. A board Bell could
# not reach closes nothing at all.
#
# About 25 minutes; the national portal is the slow part because it is read at
# the 5-second delay that site's own rules ask for. Safe to re-run any time and
# safe to close early — it resumes.
#
# Nothing is scraped from a page that does not state its vacancies properly, so
# this never invents a job.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/run_job_boards.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
