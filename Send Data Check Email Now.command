#!/bin/bash
# Send the weekly Bell data-check email RIGHT NOW (a test send).
#
# Normally this arrives by itself every Sunday morning, Qatar time. Use this to see
# what it looks like without waiting. It only reads data and sends one email to
# Bell's own inbox — it changes nothing and touches no customer.
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
"$NODE_BIN" -e "import('./ops/gap_report.js').then(async (m) => { const r = await m.sendGapReportNow(); console.log(''); console.log('Sent to: ' + r.to); console.log('Map coverage: ' + r.gaps.coverage_pct + '%'); console.log('Not kept — locations ' + r.gaps.lost.locations + ' · emails ' + r.gaps.lost.emails + ' · phones ' + r.gaps.lost.phones); process.exit(0); }).catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });"
echo
read -r -p "Press Enter to close this window... "
