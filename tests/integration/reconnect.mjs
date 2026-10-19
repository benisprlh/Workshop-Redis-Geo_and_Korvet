import assert from 'node:assert/strict';
import { cp, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createClient } from 'redis';
import { chromium } from '@playwright/test';

const root = process.cwd();
const directory = resolve(root, 'test-results/reconnect/application');
const run = promisify(execFile);
const base = 'http://localhost:3122/api';
const lab = 'fieldops-reconnect-test';
const topic = `${lab}-telemetry`;
const local = 'redis://default:fixture-before-password@redis:6379';
const endpointA = 'redis://default:fixture-before-password@database-a:6379';
const endpointB = 'redis://default:fixture-after-password@database-b:6379/1';
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const compose = (...args) =>
  run(
    resolve(root, 'scripts/workspace-compose.sh'),
    [
      '--env-file',
      '/dev/null',
      '-f',
      'compose.yaml',
      '-f',
      'infra/compose/reconnect-test.yaml',
      ...args,
    ],
    { cwd: root, timeout: 180000, maxBuffer: 2 * 1024 * 1024 },
  );
async function wait(predicate, seconds = 40) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {
      /* Service sedang beralih. */
    }
    await pause(200);
  }
  throw new Error('Batas waktu regresi pergantian koneksi tercapai.');
}
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}
let web, browser, page;
const errors = [];
const a = createClient({ url: 'redis://default:fixture-before-password@localhost:17479' });
const b = createClient({ url: 'redis://default:fixture-after-password@localhost:17480/1' });
a.on('error', () => {});
b.on('error', () => {});
async function save(url, brokers = 'korvet:9092') {
  const text = `REDIS_URL='${url}'\nKAFKA_BROKERS=${brokers}\nKORVET_NAMESPACE=korvet\nREDIS_CONNECT_TIMEOUT_MS=1500\nKAFKA_SSL=false\nKAFKA_USERNAME=\nKAFKA_PASSWORD=\n`;
  await writeFile(resolve(directory, '.env.new'), text, { mode: 0o600 });
  await rename(resolve(directory, '.env.new'), resolve(directory, '.env'));
  if (!page) return;
  const hash = createHash('sha256').update(text).digest('hex');
  // Tunggu visibilitas file pada mount VM, bukan jeda asumsi di kode aplikasi.
  await wait(async () => {
    const result = await compose(
      'exec',
      '-T',
      'api',
      'node',
      '-e',
      "process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync('/workshop-config/.env')).digest('hex'))",
    );
    return result.stdout === hash;
  });
}
async function openConnection() {
  if (!(await page.getByRole('dialog').count()))
    await page.getByRole('button', { name: /Mode workshop/ }).click();
  await page.getByRole('button', { name: /PERSIAPAN/ }).click();
}
async function check() {
  await openConnection();
  const [result] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/workshop/redis/check') && r.request().method() === 'POST',
      { timeout: 120000 },
    ),
    page.getByRole('button', { name: 'Periksa koneksi Redis', exact: true }).click(),
  ]);
  assert.equal(result.status(), 200);
  const state = await result.json();
  assert.doesNotMatch(JSON.stringify(state), /fixture-before-password|fixture-after-password/);
  return state;
}
async function streamEvents(redis) {
  const events = [];
  for await (const key of redis.scanIterator({ MATCH: `korvet:storage:local:${topic}:0*` })) {
    if ((await redis.type(key)) !== 'stream') continue;
    for (const row of await redis.xRange(key, '-', '+'))
      if (row.message.value) events.push(JSON.parse(row.message.value));
  }
  return events;
}
async function validate() {
  const state = await api('/workshop/validate', 'POST');
  assert.ok(
    state.exercises.every((e) => e.status === 'passed'),
    JSON.stringify(state.exercises),
  );
}
async function simulate(scenario = 'normal') {
  await api('/simulator/start', 'POST', { assetId: 'A-101', scenario });
  await wait(async () => {
    const state = await api('/state');
    return state.counts.received >= 2 && (scenario === 'normal' || state.alarms.length > 0);
  }, 30);
  await api('/simulator/stop', 'POST');
}
try {
  await mkdir(resolve(directory, 'apps/api'), { recursive: true });
  await cp(resolve(root, 'apps/api/src'), resolve(directory, 'apps/api/src'), { recursive: true });
  for (const name of ['geo', 'korvet'])
    await copyFile(
      resolve(root, `workshop/starters/${name}.ts`),
      resolve(directory, `apps/api/src/labs/${name}.ts`),
    );
  await save(local);
  await compose(
    'up',
    '-d',
    '--build',
    'redis',
    'database-a',
    'database-b',
    'redis-link',
    'korvet',
    'api',
  );
  await wait(async () => (await api('/state')).labId === lab);
  await Promise.all([a.connect(), b.connect()]);
  web = spawn(
    process.execPath,
    [
      resolve(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5175',
      '--strictPort',
    ],
    {
      cwd: resolve(root, 'apps/web'),
      env: { ...process.env, API_PROXY: 'http://localhost:3122' },
      stdio: 'ignore',
    },
  );
  await wait(async () => (await fetch('http://localhost:5175')).ok);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('http://127.0.0.1:5175', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Ringkasan', exact: true }).waitFor();
  const initial = await check();
  assert.equal(initial.redisConnection.status, 'local');
  assert.equal(initial.infra.producer, false);
  console.log('LULUS: endpoint lokal tetap terkunci; Korvet menunggu konfigurasi UI.');

  await save(endpointA);
  const first = await check();
  assert.equal(first.redisConnection.status, 'passed', first.redisConnection.message);
  assert.equal(first.redisConnection.korvet.status, 'passed', first.redisConnection.korvet.message);
  const starter = await api('/workshop/validate', 'POST');
  assert.deepEqual(
    starter.exercises.map((e) => e.status),
    ['todo', 'dependency', 'todo', 'todo'],
  );
  for (const name of ['geo', 'korvet'])
    await copyFile(
      resolve(root, `workshop/solutions/${name}.solution.ts`),
      resolve(directory, `apps/api/src/labs/${name}.ts`),
    );
  await wait(async () => (await api('/state')).redisConnection.status === 'unchecked');
  await check();
  await validate();
  await simulate();
  const before = await streamEvents(a);
  assert.ok(before.length >= 2);
  assert.equal((await streamEvents(b)).length, 0);
  const logBefore = (await compose('logs', '--no-color', 'api')).stdout.match(
    /FieldOps API pada port/g,
  )?.length;

  await save(endpointB);
  const switched = await check();
  assert.equal(switched.redisConnection.status, 'passed', switched.redisConnection.message);
  assert.equal(switched.redisConnection.endpoint.host, 'database-b');
  assert.equal(switched.redisConnection.endpoint.database, 1);
  assert.equal(
    switched.redisConnection.korvet.status,
    'passed',
    switched.redisConnection.korvet.message,
  );
  assert.equal(switched.redisConnection.korvet.managed, true);
  assert.equal(switched.counts.received, 0);
  assert.equal(switched.infra.consumer, false);
  assert.ok(switched.exercises.every((e) => e.status !== 'passed'));
  await page.locator('.connection-korvet').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(root, 'test-results/screenshots/reconnect-verified-1440.png'),
  });
  await validate();
  await simulate('temperature');
  const after = await streamEvents(b);
  assert.ok(after.length >= 2);
  assert.equal(
    (await streamEvents(a)).length,
    before.length,
    'Redis sebelumnya tidak menerima telemetry baru.',
  );
  assert.ok(after.every((event) => !before.some((old) => old.eventId === event.eventId)));
  const state = await api('/state');
  assert.ok(
    state.events.every((event) => after.some((stored) => stored.eventId === event.eventId)),
  );
  assert.ok(state.alarms.length > 0, 'Alarm harus berasal dari consumer setelah perpindahan.');
  const logAfter = (await compose('logs', '--no-color', 'api')).stdout.match(
    /FieldOps API pada port/g,
  )?.length;
  assert.equal(logAfter, logBefore, 'Perubahan .env tidak me-restart API.');
  const oldClients = String(await a.sendCommand(['CLIENT', 'LIST']))
    .trim()
    .split('\n');
  assert.equal(
    oldClients.length,
    1,
    'Hanya observer uji yang masih terhubung ke Redis sebelumnya.',
  );
  assert.equal(
    (await check()).redisConnection.korvet.status,
    'passed',
    'Pemeriksaan berulang tetap memakai Redis baru.',
  );
  console.log(
    'LULUS: UI memindahkan API dan Korvet ke Redis lain dengan password dan database berbeda; empat latihan, consumer, alarm, serta bukti Streams lulus tanpa restart API.',
  );

  await save(endpointB, 'localhost:1');
  const offline = await check();
  assert.equal(offline.redisConnection.status, 'passed');
  assert.equal(offline.redisConnection.korvet.status, 'failed');
  assert.deepEqual(offline.redisConnection.korvet.brokers, ['localhost:1']);
  assert.equal(offline.infra.producer, false);
  assert.ok(
    offline.exercises
      .filter((e) => e.id.startsWith('KORVET'))
      .every((e) => e.status === 'infrastructure'),
  );
  await save(endpointB);
  assert.equal(
    (await check()).redisConnection.korvet.status,
    'passed',
    'Producer KafkaJS harus dibuat ulang setelah broker berubah.',
  );
  console.log(
    'LULUS: KAFKA_BROKERS yang diubah lewat .env diterapkan; broker gagal tidak memakai koneksi lama, pemulihan berhasil.',
  );

  await save(endpointA, 'korvet-external:9092');
  const mismatch = await check();
  assert.equal(mismatch.redisConnection.status, 'passed');
  assert.equal(mismatch.redisConnection.korvet.managed, false);
  assert.equal(mismatch.redisConnection.korvet.status, 'failed');
  assert.match(mismatch.redisConnection.korvet.message, /event uji tidak ditemukan/i);
  assert.match(mismatch.redisConnection.korvet.message, /broker eksternal/);
  assert.equal(mismatch.infra.producer, false);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator('.connection-korvet').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(root, 'test-results/screenshots/reconnect-storage-mismatch-1366.png'),
  });
  const blocked = await api('/workshop/validate', 'POST');
  assert.ok(
    blocked.exercises
      .filter((e) => e.id.startsWith('KORVET'))
      .every((e) => e.status === 'infrastructure'),
  );
  await save(endpointB);
  assert.equal((await check()).redisConnection.korvet.status, 'passed');
  assert.deepEqual(errors, []);
  console.log(
    'LULUS: Redis API dan penyimpanan Korvet eksternal yang berbeda dilaporkan sebagai masalah infrastruktur; tidak ada status sukses palsu.',
  );
} catch (error) {
  console.error(error);
  const control = await compose(
    'exec',
    '-T',
    'redis-link',
    'node',
    '-e',
    "const fs=require('fs');for(const f of ['desired','active','stopped'])try{console.log(f,fs.readFileSync('/run/fieldops-korvet/'+f,'utf8'))}catch{}",
  ).catch(() => ({ stdout: '' }));
  console.error(control.stdout);
  const processes = await compose('exec', '-T', 'korvet', 'ps', '-o', 'pid,ppid,comm').catch(
    () => ({ stdout: '' }),
  );
  console.error(processes.stdout);
  const logs = await compose('logs', '--tail=35', 'api', 'korvet', 'redis-link').catch(() => ({
    stdout: '',
  }));
  console.error(
    logs.stdout
      .replaceAll('fixture-before-password', '[fixture]')
      .replaceAll('fixture-after-password', '[fixture]'),
  );
  throw error;
} finally {
  await browser?.close();
  if (web?.exitCode === null) {
    web.kill('SIGTERM');
    await once(web, 'exit');
  }
  if (a.isOpen) await a.disconnect().catch(() => {});
  if (b.isOpen) await b.disconnect().catch(() => {});
  if (!process.env.KEEP_RECONNECT_FIXTURE) await compose('down', '--volumes').catch(() => {});
}
