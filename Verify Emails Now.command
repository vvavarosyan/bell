#!/bin/bash
# Bell — verify stored email addresses FOR FREE using DNS + the mail servers' own answers.
# Never sends an email. Dead domains → invalid; server-confirmed mailboxes → verified;
# catch-all servers → noted, never trusted. ~15-25 min per run; also runs nightly on the ROG.
cd "$(dirname "$0")/Portal/server" || exit 1
clear
node ops/email_verify.js
echo ""
read -p "Press Return to close…"
