#!/bin/bash
# Bell Data Intelligence — Postgres Setup (no terminal needed)
#
# Double-click this file to:
#   1. Verify Postgres.app is installed (and guide install if not)
#   2. Make sure Postgres is running
#   3. Create the local `bell_intel` database
#   4. Apply any pending SQL migrations under Portal/migrations/
#
# Safe to re-run any time. Each migration is applied only once.

set -u

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MIGRATIONS_DIR="$SCRIPT_DIR/Portal/migrations"
DB_NAME="bell_intel"
PG_APP_PATH="/Applications/Postgres.app"
PSQL=""

bar() { printf "==========================================================\n"; }

bar
echo "   Bell Data Intelligence — Postgres setup"
bar
echo
echo "Workspace: $SCRIPT_DIR"
echo

# -----------------------------------------------------------------------------
# 1. Verify Postgres.app
# -----------------------------------------------------------------------------
if [ ! -d "$PG_APP_PATH" ]; then
  echo "Postgres.app is not installed."
  echo
  echo "Install it (free, no terminal needed):"
  echo "  1. We'll open the Postgres.app download page in your browser now."
  echo "  2. Click 'Download', open the .dmg, and drag Postgres into Applications."
  echo "  3. Launch Postgres.app once so it can create its data directory."
  echo "  4. Then come back here and double-click this file again."
  echo
  open "https://postgresapp.com/downloads.html"
  echo
  read -r -p "Press Enter to close..." _
  exit 1
fi

# Look for psql shipped with Postgres.app (latest version directory)
for cand in "$PG_APP_PATH"/Contents/Versions/latest/bin/psql \
            "$PG_APP_PATH"/Contents/Versions/*/bin/psql; do
  if [ -x "$cand" ]; then
    PSQL="$cand"
    break
  fi
done

if [ -z "$PSQL" ]; then
  echo "ERROR: Postgres.app is installed but I can't find psql inside it."
  echo "Path checked: $PG_APP_PATH/Contents/Versions/.../bin/psql"
  echo
  echo "Try launching Postgres.app once from your Applications folder, then"
  echo "double-click this installer again."
  read -r -p "Press Enter to close..." _
  exit 1
fi

PG_BIN_DIR="$(dirname "$PSQL")"
export PATH="$PG_BIN_DIR:$PATH"
echo "Postgres CLI: $PSQL"
echo

# -----------------------------------------------------------------------------
# 2. Make sure Postgres is running
# -----------------------------------------------------------------------------
# Quick ping. If it fails, launch the app and wait a few seconds.
if ! "$PSQL" -h localhost -U "$USER" -d postgres -tAc "SELECT 1;" >/dev/null 2>&1; then
  echo "Starting Postgres.app..."
  open -a "Postgres"
  # Wait up to 30s
  for i in $(seq 1 30); do
    sleep 1
    if "$PSQL" -h localhost -U "$USER" -d postgres -tAc "SELECT 1;" >/dev/null 2>&1; then
      echo "Postgres is running."
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo
      echo "ERROR: Postgres didn't respond after 30 seconds."
      echo "Open Postgres.app manually, click the 'Start' button on its server,"
      echo "then double-click this installer again."
      read -r -p "Press Enter to close..." _
      exit 1
    fi
  done
fi

# -----------------------------------------------------------------------------
# 3. Create database if missing
# -----------------------------------------------------------------------------
DB_EXISTS="$("$PSQL" -h localhost -U "$USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null || true)"

if [ "$DB_EXISTS" != "1" ]; then
  echo "Creating database '$DB_NAME'..."
  "$PSQL" -h localhost -U "$USER" -d postgres -c "CREATE DATABASE $DB_NAME;" || {
    echo "ERROR: could not create database '$DB_NAME'."
    read -r -p "Press Enter to close..." _
    exit 1
  }
else
  echo "Database '$DB_NAME' already exists."
fi

# -----------------------------------------------------------------------------
# 4. Apply migrations
# -----------------------------------------------------------------------------
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "ERROR: migrations directory missing: $MIGRATIONS_DIR"
  read -r -p "Press Enter to close..." _
  exit 1
fi

# Make sure schema_migrations exists so we can check what's already applied.
# (The first migration creates it, so the first run skips this check.)
HAS_MIGRATIONS_TABLE="$("$PSQL" -h localhost -U "$USER" -d "$DB_NAME" -tAc \
  "SELECT to_regclass('public.schema_migrations') IS NOT NULL;" 2>/dev/null || echo "f")"

echo
echo "Applying migrations from: $MIGRATIONS_DIR"
echo

APPLIED=0
SKIPPED=0
FAILED=0

shopt -s nullglob
for sql_file in "$MIGRATIONS_DIR"/*.sql; do
  filename="$(basename "$sql_file")"
  # Extract the leading numeric version (e.g. "0001" from "001_initial_schema.sql"
  # or "0002" from "0002_xxx.sql"). We pad to 4 digits to match schema_migrations.
  version_raw="${filename%%_*}"
  version="$(printf "%04d" "$((10#$version_raw))" 2>/dev/null || echo "$version_raw")"

  already_applied="f"
  if [ "$HAS_MIGRATIONS_TABLE" = "t" ]; then
    already_applied="$("$PSQL" -h localhost -U "$USER" -d "$DB_NAME" -tAc \
      "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='$version');" 2>/dev/null || echo "f")"
  fi

  if [ "$already_applied" = "t" ]; then
    echo "  ⏭  $filename (already applied)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "  ▶  $filename"
  if "$PSQL" -h localhost -U "$USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$sql_file" >/dev/null 2>"$SCRIPT_DIR/Operations/run_logs/migration_${version}_error.log"; then
    APPLIED=$((APPLIED + 1))
    HAS_MIGRATIONS_TABLE="t"
    # Make absolutely sure this version is recorded even if the SQL file forgot
    "$PSQL" -h localhost -U "$USER" -d "$DB_NAME" -tAc \
      "INSERT INTO schema_migrations (version) VALUES ('$version') ON CONFLICT DO NOTHING;" >/dev/null 2>&1
    rm -f "$SCRIPT_DIR/Operations/run_logs/migration_${version}_error.log"
    echo "     ✓ applied"
  else
    FAILED=$((FAILED + 1))
    echo "     ✗ FAILED — see Operations/run_logs/migration_${version}_error.log"
  fi
done

echo
bar
echo "   Summary"
bar
echo "  Applied : $APPLIED"
echo "  Skipped : $SKIPPED"
echo "  Failed  : $FAILED"
echo

# -----------------------------------------------------------------------------
# 5. Show what's in the database
# -----------------------------------------------------------------------------
echo "Tables in '$DB_NAME':"
"$PSQL" -h localhost -U "$USER" -d "$DB_NAME" -c \
  "SELECT schemaname, tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>/dev/null

echo
if [ "$FAILED" -gt 0 ]; then
  echo "Setup completed with errors. Check the logs in Operations/run_logs/."
else
  echo "✅ Postgres setup complete. Database '$DB_NAME' is ready."
  echo
  echo "Connection info (you'll only need this if you're poking around manually):"
  echo "  host:     localhost"
  echo "  port:     5432"
  echo "  database: $DB_NAME"
  echo "  user:     $USER"
fi
echo
read -r -p "Press Enter to close..." _
