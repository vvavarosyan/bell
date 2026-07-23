#!/bin/bash
# Bell.qa — Qatar Chamber scraper setup.
# This scraper now uses Firecrawl (no heavy install needed). The only setup is
# saving your Firecrawl API key.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"
echo "No install needed — this scraper uses Firecrawl."
echo
echo "Next steps:"
echo "  1. Run 'Set Firecrawl API Key.command'  (one time)"
echo "  2. Run 'Run Scan Now.command'"
echo
read -r -p "Press Enter to close..." _
