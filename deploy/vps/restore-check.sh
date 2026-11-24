#!/bin/sh
# Restores the newest backup into a scratch database, prints row counts, drops it
set -eu
cd "$(dirname "$0")"
latest=$(ls -1 backups/uweek-*.dump | tail -n 1)
check=uweek_restore_check
psql() { docker compose exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
psql -c "DROP DATABASE IF EXISTS $check" -c "CREATE DATABASE $check"
docker compose exec -T postgres pg_restore -U postgres --no-owner --exit-on-error -d "$check" <"$latest"
echo "restored $latest"
psql -d "$check" -c "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM tasks) AS tasks, (SELECT count(*) FROM drizzle.__drizzle_migrations) AS migrations"
psql -c "DROP DATABASE $check"
