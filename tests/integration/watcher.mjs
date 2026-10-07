import { mkdtemp, mkdir, cp, copyFile, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Kafka, logLevel } from 'kafkajs';

// Jalankan di container API: broker mengiklankan alamat jaringan Compose.
const root = process.cwd(),
  fixture = await mkdtemp(resolve(tmpdir(), 'fieldops-watch-'));
const labId = `fieldops-watch-${randomUUID().slice(0, 8)}`,
  port = 3103;
const base = `http://localhost:${port}`;
await mkdir(resolve(fixture, 'apps/api'), { recursive: true });
for (const path of ['apps/api/src', 'packages/contracts', 'docs', 'workshop']) {
  await cp(resolve(root, path), resolve(fixture, path), { recursive: true });
}
await copyFile(resolve(root, 'package.json'), resolve(fixture, 'package.json'));
await symlink(resolve(root, 'node_modules'), resolve(fixture, 'node_modules'), 'dir');
let output = '';
const child = spawn(
  process.execPath,
  [
    resolve(root, 'node_modules/tsx/dist/cli.mjs'),
    'watch',
    '--clear-screen=false',
    resolve(fixture, 'apps/api/src/server.ts'),
  ],
  {
    cwd: fixture,
    env: {
      ...process.env,
      LAB_ID: labId,
      API_PORT: String(port),
      TELEMETRY_TOPIC: '',
      KAFKA_GROUP_ID: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(predicate, seconds = 40) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      if (await predicate()) return;
    } catch {}
    await pause(300);
  }
  throw new Error('Watcher/API tidak mencapai kondisi yang diharapkan.');
}
async function api(path, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
const starts = () => output.split(`FieldOps API pada port ${port}`).length - 1;
async function change(action) {
  const previous = starts();
  await promisify(execFile)(
    process.execPath,
    [resolve(root, 'scripts/labs/files.mjs'), action, 'all'],
    { cwd: fixture },
  );
  await wait(() => starts() > previous);
  await pause(1000);
  await wait(async () => (await api('/state')).infra.producer);
}
const kafka = new Kafka({
  clientId: `${labId}-inspect`,
  brokers: (process.env.KAFKA_BROKERS || 'korvet:9092').split(','),
  logLevel: logLevel.NOTHING,
  ssl: process.env.KAFKA_SSL === 'true',
  sasl:
    process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD
      ? {
          mechanism: 'plain',
          username: process.env.KAFKA_USERNAME,
          password: process.env.KAFKA_PASSWORD,
        }
      : undefined,
});
const admin = kafka.admin();
const browsers = [];
try {
  await wait(async () => (await api('/state')).infra.producer);
  assert.ok((await api('/state')).exercises.every((exercise) => exercise.status === 'todo'));
  await change('apply');
  assert.ok(
    (await api('/workshop/validate', 'POST', {})).exercises.every(
      (exercise) => exercise.status === 'passed',
    ),
  );
  await wait(async () => (await api('/state')).infra.consumer);
  await admin.connect();
  for (let i = 0; i < 2; i++) {
    const controller = new AbortController();
    browsers.push(controller);
    const response = await fetch(`${base}/api/events`, { signal: controller.signal });
    assert.ok((await response.body.getReader().read()).value.length > 0);
  }
  await api('/workshop/validate', 'POST', {});
  const groups = await admin.describeGroups([`${labId}-dashboard`]);
  assert.equal(
    groups.groups[0].members.length,
    1,
    'Dua browser/validasi berulang tetap harus memakai satu consumer.',
  );
  browsers.forEach((controller) => controller.abort());
  await api('/data/reset', 'POST', { confirm: labId });
  await change('reset');
  const starter = await api('/state');
  assert.ok(starter.exercises.every((exercise) => exercise.status === 'todo'));
  assert.equal(starter.infra.consumer, false);
  const backups = await readdir(resolve(fixture, '.workshop-backups'));
  assert.equal(backups.length, 2);
  console.log(
    'LULUS: apply/reset dengan backup pada salinan memicu watcher tanpa rebuild; dua SSE dan validasi berulang tetap satu consumer dashboard.',
  );
} catch (error) {
  console.error(output.slice(-3000));
  throw error;
} finally {
  browsers.forEach((controller) => controller.abort());
  await api('/data/reset', 'POST', { confirm: labId }).catch(() => {});
  await admin.disconnect().catch(() => {});
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), pause(15000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(fixture, { recursive: true, force: true });
}
