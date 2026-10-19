#!/bin/sh
set -eu
umask 077
if [ -s /certificates/localhost.key ] && [ -s /certificates/localhost.crt ] &&
  openssl x509 -in /certificates/localhost.crt -checkend 86400 -noout >/dev/null 2>&1; then
  echo 'Sertifikat HTTPS localhost tersedia.'
  exit 0
fi
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
  -config /https/localhost.cnf \
  -keyout /certificates/localhost.key.new -out /certificates/localhost.crt.new 2>/dev/null
mv /certificates/localhost.key.new /certificates/localhost.key
mv /certificates/localhost.crt.new /certificates/localhost.crt
echo 'Sertifikat HTTPS localhost dibuat. UI tersedia pada https://localhost:8443.'
