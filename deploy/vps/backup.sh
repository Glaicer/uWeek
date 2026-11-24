#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p backups
target="backups/uweek-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T postgres pg_dump -U postgres --format=custom uweek >"$target.partial"
mv "$target.partial" "$target"
find backups -name 'uweek-*.dump' -mtime +"${KEEP_DAYS:-14}" -delete
find backups -name '*.partial' -mmin +60 -delete
