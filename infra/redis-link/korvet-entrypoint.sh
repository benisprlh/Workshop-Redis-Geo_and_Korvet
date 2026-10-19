#!/bin/sh
set -eu
if [ -z "${REDIS_URL:-}" ]; then
  echo 'REDIS_URL belum diisi. Isi endpoint database Redis pada .env sebelum menjalankan Korvet.' >&2
  exit 1
fi
case "$REDIS_URL" in
  redis://*|rediss://*) ;;
  *) echo 'REDIS_URL harus memakai redis:// atau rediss://.' >&2; exit 1 ;;
esac
redis_address="${REDIS_URL#*://}"
redis_authority="${redis_address%%/*}"
redis_host="${redis_authority##*@}"
case "$redis_host" in
  ''|:*) echo 'REDIS_URL harus berisi hostname database.' >&2; exit 1 ;;
esac
# Endpoint selalu eksplisit. Korvet tidak memakai konfigurasi localhost bawaannya.
if [ "${KORVET_REDIS_USE_LINK:-false}" != 'true' ]; then
  export KORVET_REDIS_URI="$REDIS_URL"
  exec /korvet/bin/korvet "$@"
fi
# Pertahankan kredensial/database URI; hanya alamat transport pada jaringan Compose diganti.
# Tidak mencetak URI dan tidak menulis Redis melalui helper ini.
redis_auth=""
redis_database=""
case "$redis_authority" in *@*) redis_auth="${redis_authority%@*}@" ;; esac
case "$redis_address" in */*) redis_database="/${redis_address#*/}" ;; esac
export KORVET_REDIS_URI="redis://${redis_auth}redis-link:16379${redis_database}"
exec /korvet/bin/korvet "$@"
