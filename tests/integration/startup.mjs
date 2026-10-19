import assert from 'node:assert/strict';
import { cp, copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const root = process.cwd();
const fixture = await mkdtemp(resolve(tmpdir(), 'fieldops-startup-'));
const port = 3121;
const base = `http://127.0.0.1:${port}/api`;
let child;
let connections = 0;
const endpoint = createServer((socket) => {
  connections += 1;
  socket.destroy();
});
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function api(path, method = 'GET') {
  const response = await fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
}
async function stop() {
  if (child?.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), pause(12000)]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
  }
}
async function start(redisUrl) {
  await stop();
  child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/server.ts'], {
    cwd: fixture,
    env: {
      ...process.env,
      LAB_ID: 'fieldops-startup-test',
      API_PORT: String(port),
      REDIS_URL: redisUrl,
      REDIS_CA_FILE: '',
      REDIS_CLIENT_CERT_FILE: '',
      REDIS_CLIENT_KEY_FILE: '',
      REDIS_TLS_SERVERNAME: '',
      REDIS_CONNECT_TIMEOUT_MS: '500',
      TELEMETRY_TOPIC: '',
      KAFKA_GROUP_ID: '',
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const state = await api('/state');
      assert.equal(state.redisConnection.status, redisUrl ? 'local' : 'unchecked');
      assert.equal(state.infra.redis, false);
      assert.equal(state.infra.producer, false);
      return;
    } catch {
      await pause(100);
    }
  }
  throw new Error('API tidak siap tanpa koneksi Redis.');
}
try {
  for (const value of ['', 'redis://', 'redis://:6379']) {
    const guard = spawnSync(
      '/bin/sh',
      [resolve(root, 'infra/redis-link/korvet-entrypoint.sh'), 'server'],
      {
        env: { ...process.env, REDIS_URL: value },
        encoding: 'utf8',
      },
    );
    assert.equal(guard.status, 1);
    assert.match(guard.stderr, /REDIS_URL/);
    assert.doesNotMatch(guard.stderr, /not found/);
  }
  await mkdir(resolve(fixture, 'apps/api'), { recursive: true });
  for (const path of [
    'apps/api/src',
    'packages/contracts',
    'README.md',
    'licenses',
    'apps/web/public',
  ])
    await cp(resolve(root, path), resolve(fixture, path), { recursive: true });
  await copyFile(resolve(root, 'package.json'), resolve(fixture, 'package.json'));
  await symlink(resolve(root, 'node_modules'), resolve(fixture, 'node_modules'), 'dir');
  endpoint.listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  await start('');
  const empty = await api('/workshop/redis/check', 'POST');
  assert.equal(empty.redisConnection.status, 'failed');
  assert.match(empty.redisConnection.message, /REDIS_URL belum diisi/);
  assert.equal(empty.redisConnection.endpoint.host, '');
  assert.equal((await api('/health')).status, 'ok');
  const blocked = await api('/workshop/validate', 'POST');
  assert.ok(blocked.exercises.every((exercise) => exercise.status === 'infrastructure'));
  await start(`redis://127.0.0.1:${endpoint.address().port}`);
  // Lewati satu interval refresh: angka false saja tidak membuktikan tidak ada percobaan socket.
  await pause(6000);
  assert.equal(connections, 0, 'Startup/refresh tidak boleh membuka koneksi Redis.');
  assert.equal((await api('/state')).redisConnection.status, 'local');
  const checked = await api('/workshop/redis/check', 'POST');
  assert.ok(connections > 0, 'Tombol periksa harus benar-benar mencoba endpoint yang diisi.');
  assert.equal(checked.redisConnection.status, 'failed');
  assert.equal(checked.infra.redis, false);
  console.log(
    'LULUS: REDIS_URL wajib, API hidup tanpa endpoint, nol socket saat startup/refresh; koneksi hanya dicoba setelah pemeriksaan manual.',
  );
} finally {
  await stop();
  endpoint.close();
  await rm(fixture, { recursive: true, force: true });
}
