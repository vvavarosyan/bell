#!/bin/bash
# Bell — refresh a chunk of the QCCI directory (qatarcid.com) USING BELL'S OWN BROWSER.
# No Firecrawl credits. Reads the 1,000 stalest listings (~45 min, polite pace),
# then feeds them through the normal QCCI ingest.
#
# NOTE: the site's protection blocks some machines' automated browsers. If this
# machine is blocked, the run STOPS after 5 pages and says so — nothing is
# wasted and nothing wrong is stored. The ROG runs its own chunk every night.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node scripts/qatarcid_recrawl.js --limit 1000
echo ""
read -p "Press Return to close…"
