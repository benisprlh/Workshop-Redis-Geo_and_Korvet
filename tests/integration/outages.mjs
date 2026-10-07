import { mkdtemp, mkdir, cp, copyFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Menghentikan hanya instance fieldops-test dari infra/compose/test.yaml.
if (!process.argv.includes('--local-test-instance'))
  throw new Error(
    'Gunakan --local-test-instance; jangan memakai endpoint instruktur untuk uji stop layanan.',
  );
const root = process.cwd(),
  temp = await mkdtemp(resolve(tmpdir(), 'fieldops-outages-'));
const lab = `fieldops-fault-${randomUUID().slice(0, 8)}`,
  port = 3102,
  base = `http://localhost:${port}`;
await mkdir(resolve(temp, 'apps/api'), { recursive: true });
await cp(resolve(root, 'apps/api/src'), resolve(temp, 'apps/api/src'), { recursive: true });
await cp(resolve(root, 'packages/contracts'), resolve(temp, 'packages/contracts'), {
  recursive: true,
});
await copyFile(resolve(root, 'package.json'), resolve(temp, 'package.json'));
await symlink(resolve(root, 'node_modules'), resolve(temp, 'node_modules'), 'dir');
for (const name of ['geo', 'korvet'])
  await copyFile(
    resolve(root, `workshop/solutions/${name}.solution.ts`),
    resolve(temp, `apps/api/src/labs/${name}.ts`),
  );
const child = spawn(
  process.execPath,
  ['--import', 'tsx', resolve(temp, 'apps/api/src/server.ts')],
  {
    cwd: temp,
    env: {
      ...process.env,
      LAB_ID: lab,
      API_PORT: String(port),
      REDIS_URL: 'redis://localhost:16379',
      KAFKA_BROKERS: 'localhost:19092',
      TELEMETRY_TOPIC: '',
      KAFKA_GROUP_ID: '',
    },
    stdio: 'ignore',
  },
);
const compose = async (...args) =>
  promisify(execFile)(
    resolve(root, 'scripts/workspace-compose.sh'),
    ['-f', 'compose.yaml', '-f', 'infra/compose/test.yaml', ...args],
    { cwd: root, env: { ...process.env, LAB_ID: 'fieldops-test' }, timeout: 60000 },
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, seconds = 45) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch {}
    await pause(400);
  }
  throw new Error('Timeout menunggu status gangguan/pemulihan.');
}
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const d = await r.json();
  assert.ok(r.ok, JSON.stringify(d));
  return d;
}
async function validate() {
  const s = await api('/workshop/validate', 'POST', {});
  assert.ok(
    s.exercises.every((e) => e.status === 'passed'),
    JSON.stringify(s.exercises),
  );
}
try {
  await wait(async () => (await api('/state')).infra.producer);
  await validate();
  const event = {
    eventId: randomUUID(),
    assetId: 'A-101',
    timestamp: new Date().toISOString(),
    temperatureC: 65,
    voltageV: 229,
    currentA: 18,
  };
  await api('/telemetry', 'POST', event);
  await wait(async () => (await api('/state')).events.some((e) => e.eventId === event.eventId));
  await compose('stop', 'korvet');
  await wait(async () => !(await api('/state')).infra.korvet);
  const before = (await api('/state')).counts.received;
  const denied = await fetch(`${base}/api/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...event, eventId: randomUUID() }),
  });
  assert.equal(denied.status, 503);
  const disconnected = await api('/workshop/validate', 'POST', {});
  assert.equal(disconnected.exercises.find((e) => e.id === 'KORVET-01').status, 'infrastructure');
  assert.equal(disconnected.exercises.find((e) => e.id === 'KORVET-02').status, 'infrastructure');
  assert.equal((await api('/state')).counts.received, before);
  await compose('up', '-d', 'korvet');
  await wait(async () => (await api('/state')).infra.producer, 60);
  await validate();
  await compose('stop', 'redis');
  await wait(async () => !(await api('/state')).infra.redis);
  const search = await fetch(`${base}/api/geo/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ center: { longitude: 106.8167439, latitude: -6.1711625 }, radiusKm: 3 }),
  });
  assert.equal(search.status, 503);
  const storage = await fetch(`${base}/api/storage`);
  assert.equal(storage.status, 503);
  const redisDown = await api('/workshop/validate', 'POST', {});
  assert.equal(redisDown.exercises.find((e) => e.id === 'GEO-01').status, 'infrastructure');
  assert.equal(redisDown.exercises.find((e) => e.id === 'KORVET-01').status, 'infrastructure');
  assert.equal((await api('/health')).status, 'ok');
  await compose('up', '-d', 'redis', 'korvet');
  await wait(async () => {
    const s = await api('/state');
    return s.infra.producer && s.infra.redis;
  }, 60);
  await validate();
  const restored = { ...event, eventId: randomUUID(), timestamp: new Date().toISOString() };
  await api('/telemetry', 'POST', restored);
  await wait(async () => (await api('/state')).events.some((e) => e.eventId === restored.eventId));
  await api('/data/reset', 'POST', { confirm: lab });
  console.log(
    'LULUS: Korvet/Redis dihentikan nyata; API tetap hidup, fitur memberi 503, validator tidak memberi sukses palsu, consumer pulih dan data tetap melalui stream.',
  );
} finally {
  await compose('up', '-d', 'redis', 'korvet').catch(() => {});
  await api('/data/reset', 'POST', { confirm: lab }).catch(() => {});
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), pause(15000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(temp, { recursive: true, force: true });
}
