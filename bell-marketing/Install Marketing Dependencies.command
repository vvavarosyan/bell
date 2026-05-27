#!/bin/bash
# Install / refresh the bell-marketing site's npm dependencies.
# Double-click this once after I scaffold the project, and again any time
# `package.json` changes (I'll tell you when).

set -e
cd "$(dirname "$0")"

cat <<'BANNER'

  ==========================================================
     Bell.qa Marketing — Installing Dependencies
  ==========================================================

BANNER

# Friendly Node.js check
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js is not installed."
  echo ""
  echo "  Install it via the macOS installer at https://nodejs.org/"
  echo "  (download the LTS version, run the .pkg, restart this script)."
  echo ""
  read -r -p "Press Enter to close..." _
  exit 1
fi

NODE_VERSION=$(node --version)
echo "→ Node $NODE_VERSION detected"
echo "→ Installing packages (this can take 1-3 minutes the first time)…"
echo ""

npm install --no-fund --no-audit

cat <<'DONE'

  ==========================================================
     ✓ Dependencies installed
  ==========================================================

  Next step: double-click "Run Marketing Locally.command" to
  start the dev server.

DONE

read -r -p "Press Enter to close..." _
