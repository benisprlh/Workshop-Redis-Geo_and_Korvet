import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRedisSettings } from '../../apps/api/src/infrastructure/redis-settings.js';
import {
  isLocalRedisHost,
  isLocalRedisEndpoint,
} from '../../apps/api/src/infrastructure/redis-endpoint.js';

test('localhost, loopback IPv4/IPv6 dan alias Compose tidak membuka persiapan', async () => {
  for (const host of [
    'localhost',
    'LOCALHOST.',
    'demo.localhost',
    '127.0.0.1',
    '127.9.3.2',
    '::1',
    '[::1]',
    '::ffff:127.0.0.1',
    '[::ffff:7f00:1]',
    '0.0.0.0',
    '::',
    'redis',
    'redis-link',
    'host.docker.internal',
    'host.lima.internal',
  ])
    assert.equal(isLocalRedisHost(host), true, host);
  for (const host of [
    'redis-db.example.test',
    '10.20.30.40',
    '172.20.1.2',
    '192.168.2.5',
    'redis-enterprise.internal',
  ])
    assert.equal(isLocalRedisHost(host), false, host);
  assert.equal(await isLocalRedisEndpoint('localhost'), true);
});

test('endpoint publik tidak mengandung URI, username atau password', () => {
  const settings = readRedisSettings({
    REDIS_URL: 'rediss://lab-user:private%40value@redis-db.example.test:12000/0',
  });
  assert.equal(settings.issue, undefined);
  assert.equal(settings.endpoint.host, 'redis-db.example.test');
  assert.equal(settings.endpoint.port, 12000);
  assert.equal(settings.endpoint.tls, true);
  assert.equal(settings.endpoint.credentialsConfigured, true);
  assert.equal(settings.options?.socket?.tls, true);
  assert.equal(
    (settings.options?.socket as { rejectUnauthorized?: boolean }).rejectUnauthorized,
    true,
  );
  assert.doesNotMatch(JSON.stringify(settings.endpoint), /lab-user|private|rediss:\/\//);
});
test('REDIS_URL wajib diisi tanpa fallback alamat atau opsi client', () => {
  for (const environment of [{}, { REDIS_URL: '' }, { REDIS_URL: '  ' }]) {
    const settings = readRedisSettings(environment);
    assert.match(settings.issue!, /REDIS_URL belum diisi/);
    assert.equal(settings.url, '');
    assert.equal(settings.endpoint.host, '');
    assert.equal(settings.options, undefined);
  }
});
test('konfigurasi salah menjadi pesan persiapan tanpa melempar atau menampilkan rahasia', () => {
  for (const url of [
    'https://lab-user:private@redis-db.example.test:12000',
    'redis://localhost:99999',
    'redis://localhost/-1',
    'redis://user:%XX@localhost:6379',
  ]) {
    const settings = readRedisSettings({ REDIS_URL: url });
    assert.ok(settings.issue);
    assert.doesNotMatch(settings.issue, /lab-user|private|%XX/);
  }
  assert.match(
    readRedisSettings({ REDIS_URL: 'redis://localhost:6379', REDIS_CA_FILE: 'ca.pem' }).issue!,
    /rediss/,
  );
  assert.match(
    readRedisSettings({
      REDIS_URL: 'rediss://localhost:6379',
      REDIS_CLIENT_CERT_FILE: 'client.crt',
    }).issue!,
    /berpasangan/,
  );
  assert.match(
    readRedisSettings({
      REDIS_URL: 'rediss://localhost:6379',
      REDIS_CA_FILE: '/missing-lab-ca.pem',
    }).issue!,
    /tidak dapat dibaca/,
  );
});
