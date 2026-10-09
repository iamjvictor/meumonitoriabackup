#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=10000}"
export PORT

exec supervisord -n -c /etc/supervisor/supervisord.conf
