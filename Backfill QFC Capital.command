#!/bin/bash
# Bell Data Intelligence — Backfill QFC Capital (WRITES the data)
#
# Adds each QFC-registered firm's Authorised + Issued Share Capital (real,
# registry-published numbers) into Bell as high-confidence financial data, then
# pushes them to the live site. About 4,800 companies get capital figures.
#
# Safe to re-run — it replaces only the QFC-sourced rows, never touches audited
# or website figures, and never guesses (a company with no published figure is
# left blank). Run "Preview QFC Capital.command" first if you haven't.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/backfill_qfc_capital.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT" --apply

echo
read -r -p "Press Enter to close this window..." _
