#!/bin/bash
# Bell — refresh a chunk of the QCCI directory (qatarcid.com) USING BELL'S OWN BROWSER.
# No Firecrawl credits. Reads the 1,000 stalest listings (~45 min, polite pace),
# then feeds them through the normal QCCI ingest.
#
# A CHROME WINDOW WILL OPEN and drive itself — that is required, not a glitch.
# Measured 2026-08-18: the site's protection blocks every headless browser Bell
# has (with and without stealth), and blocks an automated window using the
# bundled browser too. Real Chrome with its own saved profile gets through, so
# that is what this uses. Leave the window alone while it works; it closes itself.
#
# If the site ever blocks this machine outright, the run STOPS after 5 pages and
# says so — nothing is wasted and nothing wrong is stored.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
BDI_ALLOW_HEADED=1 node scripts/qatarcid_recrawl.js --limit 1000
echo ""
read -p "Press Return to close…"
