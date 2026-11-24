#!/bin/sh
# Copies the Let's Encrypt certificate where Postgres reads it; runs as certbot's --deploy-hook
set -eu
cd "$(dirname "$0")"
lineage=${RENEWED_LINEAGE:-/etc/letsencrypt/live/db.uweek.top}
# why: uid 70 is postgres in the alpine image, and Postgres refuses a key others can read
install -d -m 700 -o 70 -g 70 certs
install -m 644 -o 70 -g 70 "$lineage/fullchain.pem" certs/server.crt
install -m 600 -o 70 -g 70 "$lineage/privkey.pem" certs/server.key
if [ -n "$(docker compose ps --status running -q postgres)" ]; then
  docker compose exec -T postgres psql -U postgres -c 'SELECT pg_reload_conf()'
fi
