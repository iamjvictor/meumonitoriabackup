#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../backend"
# Prevent simultaneous runs against the same source/cache.
exec 9>"${TMPDIR:-/tmp}/meumonitor-gran-${UID}.lock"
flock -n 9 || { echo 'Já existe uma importação Gran em execução.' >&2; exit 1; }
if [[ -z "${GRAN_API_TOKEN:-}" ]]; then
  read -r -s -p 'Cole o Authorization completo (Bearer ...): ' GRAN_API_TOKEN
  printf '\n'
fi
if [[ -z "${GRAN_CLIENT_ID:-}" ]]; then
  read -r -p 'Cole o x-client-id: ' GRAN_CLIENT_ID
fi
export GRAN_API_TOKEN GRAN_CLIENT_ID
exec node --import tsx src/scripts/import-gran.ts --persist "$@"
