import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRedisSettings } from '../../apps/api/src/infrastructure/redis-settings.js';

test('endpoint publik tidak mengandung URI, username atau password', () => {
  const settings = readRedisSettings({
    REDIS_URL: 'rediss://lab-user:private%40value@redis-db.example.test:12000/0',
  });
  assert.equal(settings.issue, undefined);
  assert.equal(settings.endpoint.host, 'redis-db.example.test');
  assert.equal(settings.endpoint.port, 12000);
  assert.equal(settings.endpoint.tls, true);
  assert.equal(settings.endpoint.credentialsConfigured, true);
  assert.equal(settings.options.socket?.tls, true);
  assert.equal(
    (settings.options.socket as { rejectUnauthorized?: boolean }).rejectUnauthorized,
    true,
  );
  assert.doesNotMatch(JSON.stringify(settings.endpoint), /lab-user|private|rediss:\/\//);
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
