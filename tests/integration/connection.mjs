import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
  chmod,
  rename,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createClient } from 'redis';
import { readFile } from 'node:fs/promises';
import { remoteRedisFixture } from '../support/redis-endpoint.mjs';

const root = process.cwd();
const run = promisify(execFile);
const certs = resolve(root, 'test-results/redis-connection/certs');
const fixture = await mkdtemp(resolve(tmpdir(), 'fieldops-connection-'));
const port = 3120,
  base = `http://localhost:${port}`;
const labId = `fieldops-conn-${randomUUID().slice(0, 8)}`;
const compose = (...args) =>
  run(
    resolve(root, 'scripts/workspace-compose.sh'),
    [
      '-f',
      'compose.yaml',
      '-f',
      'infra/compose/connection-test.yaml',
      '--profile',
      'streaming',
      ...args,
    ],
    { cwd: root, timeout: 60000, maxBuffer: 1024 * 1024 },
  );
let child,
  output = '';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(predicate, seconds = 30) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {}
    await pause(150);
  }
  throw new Error('Timeout menunggu fixture koneksi.');
}
async function api(path, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status}`);
  return data;
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
const redisEndpoint = await remoteRedisFixture(
  'rediss://default:fieldops-test-password@localhost:17379',
);
const environment = {
  ...process.env,
  LAB_ID: labId,
  API_PORT: String(port),
  REDIS_URL: redisEndpoint.url,
  REDIS_CA_FILE: resolve(certs, 'ca.pem'),
  REDIS_CLIENT_CERT_FILE: resolve(certs, 'client.crt'),
  REDIS_CLIENT_KEY_FILE: resolve(certs, 'client.key'),
  REDIS_TLS_SERVERNAME: redisEndpoint.servername,
  REDIS_CONNECT_TIMEOUT_MS: '1500',
  KAFKA_BROKERS: 'localhost:19192',
  TELEMETRY_TOPIC: '',
  KAFKA_GROUP_ID: '',
  KAFKA_SSL: 'false',
  KAFKA_USERNAME: '',
  KAFKA_PASSWORD: '',
};
async function start(overrides = {}) {
  await stop();
  child = spawn(process.execPath, ['--import', 'tsx', resolve(fixture, 'apps/api/src/server.ts')], {
    cwd: fixture,
    env: { ...environment, ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  await wait(async () => (await api('/state')).labId === labId);
}
async function failedCase(label, overrides, pattern, ping = false) {
  await start(overrides);
  const state = await api('/workshop/redis/check', 'POST');
  assert.equal(state.redisConnection.status, 'failed', label);
  assert.match(state.redisConnection.message, pattern, label);
  assert.equal(state.redisConnection.checks.ping, ping, label);
  const blocked = await api('/workshop/validate', 'POST');
  assert.ok(
    blocked.exercises.every((e) => e.status === 'infrastructure'),
    label,
  );
  assert.equal(blocked.positionsReady, false);
  assert.equal(blocked.infra.consumer, false);
  assert.doesNotMatch(
    JSON.stringify(state),
    /fieldops-test-password|fieldops-ping-password|wrong-password/,
  );
  console.log(`LULUS: ${label}; fitur tetap terkunci.`);
}
try {
  await mkdir(certs, { recursive: true });
  await writeFile(
    resolve(certs, 'server.ext'),
    'subjectAltName=DNS:localhost,DNS:redis,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',
  );
  await writeFile(resolve(certs, 'client.ext'), 'extendedKeyUsage=clientAuth\n');
  const openssl = (args) => run('openssl', args, { cwd: certs });
  await openssl([
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
    '-days',
    '2',
    '-subj',
    '/CN=FieldOps Test CA',
  ]);
  for (const name of ['server', 'client']) {
    await openssl([
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      `${name}.key`,
      '-out',
      `${name}.csr`,
      '-subj',
      `/CN=${name === 'server' ? 'localhost' : 'FieldOps Test Client'}`,
    ]);
    await openssl([
      'x509',
      '-req',
      '-in',
      `${name}.csr`,
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      `${name}.crt`,
      '-days',
      '2',
      '-extfile',
      `${name}.ext`,
    ]);
  }
  // Hanya key server fixture lokal: container Redis berjalan sebagai UID redis.
  await chmod(resolve(certs, 'server.key'), 0o644);
  await compose('up', '-d', '--build', 'redis', 'redis-link', 'korvet');
  await mkdir(resolve(fixture, 'apps/api'), { recursive: true });
  for (const name of [
    'apps/api/src',
    'packages/contracts',
    'README.md',
    'licenses',
    'apps/web/public',
  ])
    await cp(resolve(root, name), resolve(fixture, name), { recursive: true });
  await copyFile(resolve(root, 'package.json'), resolve(fixture, 'package.json'));
  await symlink(resolve(root, 'node_modules'), resolve(fixture, 'node_modules'), 'dir');
  for (const name of ['geo', 'korvet'])
    await copyFile(
      resolve(root, `workshop/starters/${name}.ts`),
      resolve(fixture, `apps/api/src/labs/${name}.ts`),
    );
  await failedCase('REDIS_URL kosong', { REDIS_URL: '' }, /REDIS_URL belum diisi/);
  await failedCase(
    'URL salah tidak mematikan API',
    { REDIS_URL: 'https://localhost:17379' },
    /REDIS_URL tidak valid/,
  );
  await failedCase(
    'password salah',
    { REDIS_URL: 'rediss://default:wrong-password@localhost:17379' },
    /Autentikasi ditolak/,
  );
  await failedCase('CA tidak dipercaya', { REDIS_CA_FILE: '' }, /TLS gagal/);
  await failedCase(
    'mutual TLS tanpa sertifikat client',
    { REDIS_CLIENT_CERT_FILE: '', REDIS_CLIENT_KEY_FILE: '' },
    /TLS gagal/,
  );
  await failedCase(
    'PING saja tidak cukup: SET ditolak ACL',
    { REDIS_URL: 'rediss://ping-only:fieldops-ping-password@localhost:17379' },
    /Izin ACL belum cukup/,
    true,
  );
  await failedCase(
    'port tidak tersedia',
    { REDIS_URL: 'rediss://default:fieldops-test-password@localhost:1' },
    /tidak dapat dijangkau/,
  );
  await start({ REDIS_URL: 'rediss://default:fieldops-test-password@localhost:17379' });
  const local = await api('/workshop/redis/check', 'POST');
  assert.equal(local.redisConnection.status, 'local');
  assert.deepEqual(local.redisConnection.checks, { ping: true, writeRead: true, cleanup: true });
  assert.equal(local.infra.producer, false);
  assert.ok(
    (await api('/workshop/validate', 'POST')).exercises.every((e) => e.status === 'dependency'),
  );
  const localSearch = await fetch(`${base}/api/geo/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ center: { longitude: 106.816, latitude: -6.171 }, radiusKm: 3 }),
  });
  assert.equal(localSearch.status, 423);
  console.log(
    'LULUS: Redis localhost asli tersambung, tetapi empat latihan dan API bisnis tetap terkunci.',
  );
  await start();
  assert.equal((await api('/state')).infra.redis, false, 'Tidak tersambung otomatis.');
  const blocked = await api('/workshop/validate', 'POST');
  assert.ok(blocked.exercises.every((e) => e.status === 'dependency'));
  const state = await api('/workshop/redis/check', 'POST');
  assert.equal(state.redisConnection.status, 'passed', state.redisConnection.message);
  assert.deepEqual(state.redisConnection.checks, { ping: true, writeRead: true, cleanup: true });
  assert.equal(state.redisConnection.endpoint.tls, true);
  assert.equal('caConfigured' in state.redisConnection.endpoint, false);
  assert.equal('clientCertificateConfigured' in state.redisConnection.endpoint, false);
  const observer = createClient({
    url: environment.REDIS_URL,
    socket: {
      ca: [await readFile(resolve(certs, 'ca.pem'))],
      cert: await readFile(resolve(certs, 'client.crt')),
      key: await readFile(resolve(certs, 'client.key')),
      rejectUnauthorized: true,
      servername: environment.REDIS_TLS_SERVERNAME,
    },
  });
  observer.on('error', () => {});
  await observer.connect();
  const remaining = [];
  for await (const key of observer.scanIterator({ MATCH: `fieldops:${labId}:check:*` }))
    remaining.push(key);
  assert.deepEqual(remaining, [], 'Fixture koneksi harus dibersihkan.');
  await observer.disconnect();
  await wait(async () => (await api('/state')).infra.producer, 45);
  const starter = await api('/workshop/validate', 'POST');
  assert.deepEqual(
    starter.exercises.map((e) => e.status),
    ['todo', 'dependency', 'todo', 'todo'],
  );
  // Perubahan file dibaca oleh tombol UI yang sama, dalam proses API yang tetap berjalan.
  const liveFile = resolve(fixture, '.env');
  const apiPid = child.pid;
  const starts = () => output.split(`FieldOps API pada port ${port}`).length - 1;
  const beforeReload = starts();
  async function saveConnection(url) {
    await writeFile(
      liveFile + '.new',
      `REDIS_URL='${url}'\nREDIS_CONNECT_TIMEOUT_MS=1500\nLAB_ID=ignored-file-change\n`,
    );
    await rename(liveFile + '.new', liveFile); // Editor sering menyimpan melalui rename atomik.
  }
  const invalidPassword = new URL(environment.REDIS_URL);
  invalidPassword.password = 'reload-private-password';
  await saveConnection(invalidPassword.toString());
  assert.equal((await api('/state')).redisConnection.status, 'passed');
  const rejected = await api('/workshop/redis/check', 'POST');
  assert.equal(rejected.redisConnection.status, 'failed');
  assert.match(rejected.redisConnection.message, /Autentikasi ditolak/);
  assert.equal(rejected.infra.redis, false);
  assert.equal(rejected.infra.producer, false);
  assert.equal(rejected.infra.consumer, false);
  assert.ok(rejected.exercises.every((exercise) => exercise.status !== 'passed'));
  assert.doesNotMatch(JSON.stringify(rejected), /reload-private-password|fieldops-test-password/);
  await saveConnection('');
  const emptyLive = await api('/workshop/redis/check', 'POST');
  assert.equal(emptyLive.redisConnection.status, 'failed');
  assert.match(emptyLive.redisConnection.message, /REDIS_URL belum diisi/);
  await saveConnection(environment.REDIS_URL);
  const restored = await api('/workshop/redis/check', 'POST');
  assert.equal(restored.redisConnection.status, 'passed', restored.redisConnection.message);
  assert.equal(restored.labId, labId, 'Reload koneksi tidak mengganti namespace instance.');
  await observer.connect();
  const secondDatabase = new URL(environment.REDIS_URL);
  secondDatabase.pathname = '/1';
  await saveConnection(secondDatabase.toString());
  const switched = await api('/workshop/redis/check', 'POST');
  assert.equal(switched.redisConnection.status, 'passed', switched.redisConnection.message);
  assert.equal(switched.redisConnection.endpoint.database, 1);
  const clientsInDb1 = async () =>
    String(await observer.sendCommand(['CLIENT', 'LIST']))
      .split('\n')
      .filter((line) => /\bdb=1\b/.test(line));
  assert.equal((await clientsInDb1()).length, 1, 'Satu client utama API memakai database baru.');
  await observer.select(1);
  for await (const key of observer.scanIterator({ MATCH: `fieldops:${labId}:check:*` }))
    assert.fail(`Fixture koneksi tertinggal pada database baru: ${key}`);
  await observer.select(0);
  await saveConnection(environment.REDIS_URL);
  assert.equal((await api('/workshop/redis/check', 'POST')).redisConnection.status, 'passed');
  assert.equal((await clientsInDb1()).length, 0, 'Client database sebelumnya harus ditutup.');
  await rename(liveFile, liveFile + '.missing');
  const missingFile = await api('/workshop/redis/check', 'POST');
  assert.equal(missingFile.redisConnection.status, 'failed');
  assert.match(missingFile.redisConnection.message, /File .env tidak dapat dibaca/);
  await rename(liveFile + '.missing', liveFile);
  assert.equal((await api('/workshop/redis/check', 'POST')).redisConnection.status, 'passed');
  const repeated = await Promise.all([
    fetch(`${base}/api/workshop/redis/check`, { method: 'POST' }),
    fetch(`${base}/api/workshop/redis/check`, { method: 'POST' }),
  ]);
  assert.deepEqual(repeated.map((response) => response.status).sort(), [200, 409]);
  await Promise.all(repeated.map((response) => response.arrayBuffer()));
  assert.equal(child.pid, apiPid);
  assert.equal(child.exitCode, null);
  assert.equal(starts(), beforeReload, 'Tidak ada restart API selama pergantian koneksi.');
  await observer.disconnect();
  console.log(
    'LULUS: save atomik .env dibaca dari Periksa koneksi, password salah/kosong/file hilang ditolak, database berganti dan client lama ditutup, namespace tetap, klik bersamaan ditolak, tanpa restart API.',
  );
  await api('/data/reset', 'POST', { confirm: labId });
  await stop();
  console.log(
    'LULUS: Redis asli dengan password, CA privat, mutual TLS; cleanup dan starter tetap terkunci setelah koneksi lulus.',
  );
  // Alur bisnis lengkap pada salinan solusi, dengan Korvet resmi menulis ke Redis TLS yang sama.
  const integration = await run(
    process.execPath,
    [resolve(root, 'tests/integration/solutions.mjs'), '--readme'],
    { cwd: root, env: environment, timeout: 300000, maxBuffer: 1024 * 1024 },
  );
  console.log(integration.stdout.trim());
} catch (error) {
  console.error(output.slice(-1500));
  const logs = await compose('logs', '--tail=25', 'redis', 'korvet').catch(() => ({ stdout: '' }));
  console.error(logs.stdout);
  throw error;
} finally {
  await stop();
  await compose('down').catch(() => {});
  await redisEndpoint.close();
  await rm(fixture, { recursive: true, force: true });
}
