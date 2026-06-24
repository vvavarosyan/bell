#!/bin/bash
# Stop + remove Bell's local Crawl4AI scraping engine. Double-click to run.
set -u
PLIST="$HOME/Library/LaunchAgents/com.bell-qa.crawl4ai.plist"
VENV="$HOME/.bell-crawl4ai"

echo "▸ Stopping the Bell Crawl4AI engine…"
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "✓ Background service removed. Bell falls back to its built-in renderer."
echo "  (The environment at $VENV is left in place — delete it manually to reclaim disk space.)"
echo
read -p "Press Enter to close…"
