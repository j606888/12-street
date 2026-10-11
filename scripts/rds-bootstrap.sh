#!/usr/bin/env bash
# One-time RDS setup: creates the app database and the photo_migrator /
# photo_app roles (docs/rds-setup.sql) with random passwords, and writes the
# connection strings to .env.rds.local (git-ignored, mode 600). Passwords are
# never printed. Run it in your own terminal from the repo root:
#
#   RDS_HOST=<endpoint> scripts/rds-bootstrap.sh
#
# Optional: RDS_DB (default street12), RDS_MASTER_USER (default postgres).
# Needs Docker (uses the postgres:16 image for psql) and openssl.
set -euo pipefail

HOST="${RDS_HOST:?set RDS_HOST to the RDS endpoint}"
DB="${RDS_DB:-street12}"
MASTER="${RDS_MASTER_USER:-postgres}"
OUT=".env.rds.local"

[[ -f docs/rds-setup.sql && -f certs/rds-global-bundle.pem ]] ||
  { echo "Run from the repo root." >&2; exit 1; }
[[ "${DB}" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Invalid RDS_DB." >&2; exit 1; }
if [[ -e "${OUT}" ]]; then
  echo "${OUT} already exists; move it away first (it holds the current passwords)." >&2
  exit 1
fi

read -rsp "RDS master password for ${MASTER}: " PGPASSWORD; echo
export PGPASSWORD
# Hex: no characters that need URL-encoding in DATABASE_URL
export MIGRATOR_PASSWORD="$(openssl rand -hex 24)"
export APP_PASSWORD="$(openssl rand -hex 24)"

psql() { # $1 = database; SQL on stdin
  docker run --rm -i -e PGPASSWORD -e MIGRATOR_PASSWORD -e APP_PASSWORD \
    -v "$PWD/certs:/certs:ro" -v "$PWD/docs:/docs:ro" postgres:16 \
    psql -X -q -v ON_ERROR_STOP=1 \
    "host=${HOST} port=5432 dbname=$1 user=${MASTER} sslmode=verify-full sslrootcert=/certs/rds-global-bundle.pem"
}

echo "Creating database ${DB} (if missing)..."
psql postgres <<SQL
SELECT 'CREATE DATABASE ${DB}' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${DB}') \gexec
SQL

echo "Creating roles and grants in ${DB}..."
psql "${DB}" <<'SQL'
\getenv migrator_password MIGRATOR_PASSWORD
\getenv app_password APP_PASSWORD
\i /docs/rds-setup.sql
SQL

umask 077
cat > "${OUT}" <<ENV
# Production database (RDS). Not loaded by Next.js; used for migrations/seed:
#   set -a; source ${OUT}; set +a; pnpm db:migrate
# DATABASE_URL (photo_app) also goes into Vercel env. Do not commit.
DATABASE_URL=postgres://photo_app:${APP_PASSWORD}@${HOST}:5432/${DB}
MIGRATION_DATABASE_URL=postgres://photo_migrator:${MIGRATOR_PASSWORD}@${HOST}:5432/${DB}
DATABASE_SSL=true
ENV
echo "Done. Connection strings written to ${OUT} (passwords not shown)."
