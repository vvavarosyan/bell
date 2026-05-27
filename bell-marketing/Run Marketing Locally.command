#!/bin/bash
# Start the bell-marketing dev server and open it in your browser.
# Close this Terminal window when you're done; the server stops automatically.

set -e
cd "$(dirname "$0")"

cat <<'BANNER'

  ==========================================================
     Bell.qa Marketing — Local Dev Server
  ==========================================================

     URL:    http://localhost:3000
     Stop:   close this Terminal window
     Edits:  any file under app/ or components/ auto-refreshes

  ==========================================================

BANNER

# Confirm install has happened
if [ ! -d "node_modules" ]; then
  echo "✗ node_modules is missing."
  echo "  Double-click 'Install Marketing Dependencies.command' first."
  echo ""
  read -r -p "Press Enter to close..." _
  exit 1
fi

# Open the browser after a short delay so the dev server is up
( sleep 4; open "http://localhost:3000" ) &

# Run Next dev. Press Ctrl+C or close the window to stop.
npm run dev
