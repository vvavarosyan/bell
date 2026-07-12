#!/bin/bash
# ---------------------------------------------------------------------------
# Enable ID Verification (Phase 4) — generates the encryption key + prints the
# exact steps to turn on QID / Passport collection at signup.
# The key is generated FRESH on your Mac and is never stored in the code.
# ---------------------------------------------------------------------------
cd "$(dirname "$0")"

KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null)
if [ -z "$KEY" ]; then
  echo "Could not generate a key (is Node installed?). Open the Portal once, then retry."
  read -n 1 -s -r -p "Press any key to close…"; exit 1
fi

# Store it in the local Keychain too (for completeness; the live signup runs on Railway).
security add-generic-password -a "$USER" -s "BDI_KEY_pii" -w "$KEY" -U >/dev/null 2>&1

cat <<EOF

============================================================
  BELL — ENABLE ID VERIFICATION (QID / Passport at signup)
============================================================

Collection is OFF until you add TWO settings on Railway, to BOTH services
(the customer app AND the admin app). Do this only once your lawyer has
confirmed the lawful basis.

Your new encryption key (copy it — you will paste it in step 2):

  BDI_KEY_PII = $KEY

STEPS (railway.app → your Bell project):

  1. Open the service for **app.bell.qa** → Variables.
  2. Add:   BDI_KEY_PII   =  (paste the key above)
  3. Add:   BDI_COLLECT_ID = 1
  4. Repeat 1–3 for the **admin.bell.qa** service (SAME key — so admins can
     decrypt IDs for verification).
  5. Railway redeploys automatically. Done — new signups now ask for a
     Qatar ID (or Passport, for registrants outside Qatar).

To TURN IT OFF again: set BDI_COLLECT_ID = 0 on both services (the stored
IDs stay encrypted and are still viewable by an admin).

⚠  Keep this key safe. If it is lost, previously stored IDs cannot be
   decrypted. If you change it, old IDs become unreadable.

Consent + purpose text goes in your Terms of Use (already planned).
============================================================

EOF
read -n 1 -s -r -p "Press any key to close…"
echo
