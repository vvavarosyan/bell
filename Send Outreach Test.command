#!/bin/bash
# Send ONE real outreach email, to prove the whole pipe works end-to-end.
#
# It writes a real Bell email, sends it through the isolated go.bell.qa channel with a working
# one-click Unsubscribe, and logs it. This is a MANUAL one-at-a-time test — NOT the automated
# engine, and it does not turn the engine on.
#
# DO THIS FIRST with your OWN email address, so you can see exactly how it lands and test the
# unsubscribe, before ever sending to a real company.
#
# Double-click to run.
set -u
cd "$(dirname "$0")/Portal" || exit 1

echo "=========================================================="
echo "   Bell · Send ONE outreach test email  (real send)"
echo "=========================================================="
echo
echo "Tip: put YOUR OWN email here the first time. After it arrives, click the Unsubscribe"
echo "link, then run this again to the same address — it should say BLOCKED (proof the opt-out"
echo "works). Only after you are happy, send one to a real company."
echo
read -r -p "Recipient email address: " TO
TO="$(printf '%s' "$TO" | tr -d '[:space:]')"
if [ -z "$TO" ]; then echo "No address entered. Nothing sent."; read -r -p "Press Enter to close. "; exit 1; fi

read -r -p "Company name (optional — press Enter to skip): " CO

echo
echo "Sending to: $TO"
node server/scripts/send_outreach_test.mjs "$TO" "$CO"
CODE=$?

echo
if [ $CODE -ne 0 ]; then
  echo "Something went wrong (code $CODE). Copy the lines above to Claude."
fi
read -r -p "Press Enter to close this window. "
