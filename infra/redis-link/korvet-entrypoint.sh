#!/bin/sh
set -eu
# Pertahankan kredensial/database URI; hanya alamat transport pada jaringan Compose diganti.
# Tidak mencetak URI dan tidak menulis Redis melalui helper ini.
redis_address="${REDIS_URL#*://}"
redis_authority="${redis_address%%/*}"
redis_auth=""
redis_database=""
case "$redis_authority" in *@*) redis_auth="${redis_authority%@*}@" ;; esac
case "$redis_address" in */*) redis_database="/${redis_address#*/}" ;; esac
export KORVET_REDIS_URI="redis://${redis_auth}redis-link:16379${redis_database}"
exec /korvet/bin/korvet "$@"
