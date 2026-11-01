#!/usr/bin/env bash
set -euo pipefail

supervisor_config="$(< deploy/supervisord.conf)"
entrypoint="$(< deploy/entrypoint.sh)"

grep -Fq '[program:api]' <<<"$supervisor_config"
grep -Fq '[program:worker]' <<<"$supervisor_config"
grep -Fq '[program:document-parser]' <<<"$supervisor_config"
grep -Fq 'node /app/backend/dist/server.js' <<<"$supervisor_config"
grep -Fq 'node /app/backend/dist/worker.js' <<<"$supervisor_config"
grep -Fq '127.0.0.1 --port 8080' <<<"$supervisor_config"
grep -Fq ': "${PORT:=10000}"' <<<"$entrypoint"
grep -Fq 'export PORT' <<<"$entrypoint"
grep -Fq 'exec supervisord -n -c /etc/supervisor/supervisord.conf' <<<"$entrypoint"

echo 'runtime configuration contract: PASS'
