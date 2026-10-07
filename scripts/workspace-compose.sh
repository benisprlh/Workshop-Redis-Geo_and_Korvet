#!/bin/sh
# Gunakan Docker yang sudah tersedia, atau runtime lokal yang disiapkan di workspace ini.
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
if command -v docker >/dev/null 2>&1; then
  exec docker compose "$@"
fi
lima_binary=/tmp/fieldops-tools/bin/limactl
lima_store="${XDG_DATA_HOME:-$HOME/.local/share}/fieldops-lima"
if test -x "$lima_binary" && test -d "$lima_store/fieldops"; then
  export LIMA_HOME="$lima_store"
  exec "$lima_binary" shell fieldops env LAB_ID="${LAB_ID:-fieldops-demo}" docker compose --project-directory "$project_root" "$@"
fi
echo 'Docker Compose belum tersedia. Pasang Docker Engine/Desktop sesuai README.md.' >&2
exit 1
