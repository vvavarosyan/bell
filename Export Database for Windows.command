#!/bin/bash
# Bell — Export the local database to ONE file, for the move to the Windows engine.
# Read-only: your Mac database is untouched. The file doubles as a full backup.
cd "$(dirname "$0")" || exit 1
clear
echo "=========================================================="
echo " BELL — DATABASE EXPORT (for the Windows machine)"
echo "=========================================================="
echo ""
PGDUMP="$(command -v pg_dump)"
if [ -z "$PGDUMP" ]; then
  for c in /opt/homebrew/opt/postgresql@*/bin/pg_dump /opt/homebrew/bin/pg_dump /usr/local/bin/pg_dump /Applications/Postgres.app/Contents/Versions/*/bin/pg_dump; do
    [ -x "$c" ] && PGDUMP="$c" && break
  done
fi
if [ -z "$PGDUMP" ]; then
  echo "Could not find the pg_dump tool. Tell Claude — nothing was exported."
  read -p "Press Return to close…"; exit 1
fi
OUT="$HOME/Desktop/bell-database-export-$(date +%Y%m%d-%H%M).dump"
DB="${PGDATABASE:-bell_intel}"
echo "Exporting database \"$DB\" — this can take several minutes…"
if "$PGDUMP" -Fc -d "$DB" -f "$OUT"; then
  SIZE=$(du -h "$OUT" | cut -f1)
  echo ""
  echo "DONE. One file on your Desktop:"
  echo "   $(basename "$OUT")   ($SIZE)"
  echo ""
  echo "Next: copy it to the Windows laptop (USB stick works), then tell Claude"
  echo "on the ROG: \"import the Bell database\". This Mac keeps this file as backup."
else
  echo ""
  echo "Export FAILED — nothing was written. Tell Claude the message above."
fi
echo ""
read -p "Press Return to close…"
