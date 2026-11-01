#!/usr/bin/env bash
set -euo pipefail

dockerfile="$(< Dockerfile)"

grep -Fq 'FROM python:3.12-slim' <<<"$dockerfile"
grep -Fq 'backend/package.json' <<<"$dockerfile"
grep -Fq 'backend/package-lock.json' <<<"$dockerfile"
grep -Fq 'services/document-parser/pyproject.toml' <<<"$dockerfile"
grep -Fq 'services/document-parser/uv.lock' <<<"$dockerfile"
grep -Fq 'uv sync --locked' <<<"$dockerfile"
grep -Fq 'npm run build' <<<"$dockerfile"
grep -Fq 'COPY deploy' <<<"$dockerfile"
grep -Fq 'supervisord.conf' <<<"$dockerfile"
grep -Fq 'ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]' <<<"$dockerfile"

echo 'Dockerfile contract: PASS'
