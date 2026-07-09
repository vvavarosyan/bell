#!/bin/bash
# Bell Data Intelligence — Engine Flag Repair (APPLY — writes to the local DB)
#
# Restores the engine stage flags that the accidental full re-queue cleared,
# ONLY for companies whose stage*_status proves the engine already ran.
# Companies that genuinely never ran stay pending. Engine 6 (Tech Stack) is
# left alone on purpose — it is new and should scan every website once.
#
# Run "Preview Engine Flag Repair.command" FIRST and check the numbers.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "This will WRITE to your local Bell database (restore engine stage flags)."
read -r -p "Type YES and press Enter to continue: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Cancelled — nothing changed."; read -r -p "Press Enter to close..." _; exit 0
fi

cd "$SERVER_DIR"
REPAIR_APPLY=1 "$NODE_BIN" "$SERVER_DIR/scripts/repair_engine_flags.js"

echo
read -r -p "Press Enter to close this window..." _
