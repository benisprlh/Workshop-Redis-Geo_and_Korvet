#!/bin/sh
set -eu
# Jalankan binary distribusi resmi. Konfigurasi runtime hanya ditulis layanan backend.
runtime_dir="$KORVET_RUNTIME_DIRECTORY"
child=''
running=''
read_value() { cat "$runtime_dir/$1" 2>/dev/null || true; }
stop_broker() {
  if [ -n "$child" ]; then
    kill -TERM "$child" 2>/dev/null || true
    remaining=12
    while kill -0 "$child" 2>/dev/null && [ "$remaining" -gt 0 ]; do
      sleep 1
      remaining=$((remaining - 1))
    done
    kill -KILL "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
  fi
  child=''
  running=''
}
trap 'stop_broker; exit 0' TERM INT
while :; do
  desired=$(read_value desired)
  active=$(read_value active)
  if [ -n "$desired" ] && [ "$desired" != "$running" ]; then
    stop_broker
    printf '%s' "$desired" > "$runtime_dir/stopped"
  fi
  if [ -n "$desired" ] && [ "$desired" = "$active" ] && [ -z "$child" ]; then
    export KORVET_REDIS_URI="$(read_value redis-uri)"
    export KORVET_NAMESPACE="$(read_value namespace)"
    /korvet/bin/korvet "$@" &
    child=$!
    running="$active"
  fi
  if [ -n "$child" ] && ! kill -0 "$child" 2>/dev/null; then
    wait "$child" 2>/dev/null || true
    child=''
    running=''
  fi
  sleep 1
done
