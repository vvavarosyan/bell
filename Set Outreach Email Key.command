#!/bin/bash
# Save the SECOND Resend API key — the one for Bell's OUTREACH sending account — into the
# macOS Keychain (bdi-resend-outreach). This is deliberately a SEPARATE Resend account from
# the one that sends your invites/receipts/customer mail, so an outreach problem can never
# take those down. The key is typed by you and stored securely — never written to a file or
# committed to git. Double-click to run.
#
# NOTE: on the LIVE site (Railway) this key is set differently — as an environment variable
# BDI_KEY_RESEND_OUTREACH in the Railway Variables tab. This command is for your local Mac.
set -u

echo "======================================================"
echo "   Bell · Set OUTREACH Resend API key (separate acct)"
echo "======================================================"
echo
echo "1. Create a SECOND Resend account at https://resend.com (a different login from your"
echo "   main Bell account — this is the firewall)."
echo "2. In it, add the domain go.bell.qa and add the DNS records it shows you (Claude will"
echo "   guide you through the NameHero side)."
echo "3. Create an API key there, then paste it below."
echo
read -r -p "Paste the OUTREACH Resend API key, then press Enter: " KEY
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

if [ -z "$KEY" ]; then
  echo "No key entered — nothing saved."
  read -r -p "Press Enter to close..." _
  exit 1
fi

if security add-generic-password -a "bell-data-intelligence" -s "bdi-resend-outreach" -w "$KEY" -U 2>/dev/null; then
  echo
  echo "OK  Saved to your Keychain (bdi-resend-outreach)."
  echo "    Outreach mail will send from go.bell.qa through this separate account, fully"
  echo "    isolated from your bell.qa transactional mail."
else
  echo
  echo "X  Could not save to the Keychain. Try again, or check Keychain Access."
fi
echo
read -r -p "Press Enter to close..." _
