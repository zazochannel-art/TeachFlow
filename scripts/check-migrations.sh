#!/usr/bin/env bash
# Applies every migration in order to an empty Supabase Postgres. A migration that says it is
# "safe to run more than once" is applied a second time right away, to hold it to that promise.
# Used by CI; locally:
#   docker run -d --name tfdb -e POSTGRES_PASSWORD=postgres -p 54322:5432 supabase/postgres:15.8.1.085
#   PGPASSWORD=postgres DATABASE_URL=postgres://postgres@127.0.0.1:54322/postgres \
#     ADMIN_DATABASE_URL=postgres://supabase_admin@127.0.0.1:54322/postgres scripts/check-migrations.sh
# The migrations run as `postgres`, like in the Supabase SQL Editor; the service stubs need the
# image's superuser (supabase_admin).
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
: "${ADMIN_DATABASE_URL:?set ADMIN_DATABASE_URL}"
cd "$(dirname "$0")/.."

run() { psql "$1" -v ON_ERROR_STOP=1 -q -f "$2" 2>&1 | { grep -v "NOTICE" || true; }; return "${PIPESTATUS[0]}"; }

run "$ADMIN_DATABASE_URL" supabase/ci/service-stubs.sql
for f in supabase/migrations/*.sql; do
  echo "apply $f"
  run "$DATABASE_URL" "$f"
  if grep -qi "more than once" "$f"; then
    echo "again $f"
    run "$DATABASE_URL" "$f"
  fi
done
echo "All migrations applied."
