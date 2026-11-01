#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

docker buildx build \
  --platform linux/amd64 \
  --file Dockerfile.railway-api-worker \
  --tag asevedocompany/meumonitor-api-worker:latest \
  --tag asevedocompany/meumonitor-api-worker:teacher-drafts-20261024 \
  --push \
  .
