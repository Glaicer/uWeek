#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 -v password="$APP_DB_PASSWORD" --username postgres --dbname uweek <<'SQL'
CREATE ROLE uweek_app LOGIN PASSWORD :'password';
ALTER DATABASE uweek OWNER TO uweek_app;
SQL
