#!/bin/bash
# Bell — GET QATAR'S RECENT LAWS (the ones Bell is missing, including PDPPL).
#
# WHY: Al Meezan publishes Qatar's laws from about 2015 onwards in ARABIC ONLY, and Bell's
# old crawler read English only (and stopped at id 7200) — so every recent law was silently
# skipped. That is why Bella knew nothing about the PDPPL. The crawler is fixed, but the
# normal scan walks the archive in order from the beginning, so the missing recent laws are
# LAST in line, hours away.
#
# WHAT THIS DOES: skips ahead to the range Bell is actually missing (law ids 7000+, where
# PDPPL lives) and fetches those laws WITH their articles, so Bella can quote what a law
# really says. Resumable — close the window whenever you like and run it again to continue.
# It only reads Al Meezan; it changes no company data.
#
# Run it a few times until it says PDPPL is IN. Afterwards, the normal
# "Run Qatar Knowledge Scan.command" keeps everything else up to date.
#
# ⚠ Close any other scan/enrich window first — one crawler at a time on an 8 GB Mac.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break; done
[ -z "$NODE_BIN" ] && { echo "ERROR: Node.js not found."; read -r -p "Press Enter..." _; exit 1; }
cd "$SERVER_DIR"; caffeinate -i "$NODE_BIN" "$SERVER_DIR/scripts/fetch_qatar_laws.js"
echo; read -r -p "Press Enter to close this window..." _
