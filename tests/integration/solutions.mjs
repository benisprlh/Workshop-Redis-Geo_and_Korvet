import { mkdtemp, mkdir, cp, copyFile, symlink, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from '@playwright/test';

const root = process.cwd(),
  temp = await mkdtemp(resolve(tmpdir(), 'fieldops-solution-'));
const labId = `fieldops-it-${randomUUID().slice(0, 8)}`;
const port = Number(process.env.TEST_API_PORT || 3101),
  base = `http://localhost:${port}`;
const environment = {
  ...process.env,
  LAB_ID: labId,
  API_PORT: String(port),
  TELEMETRY_TOPIC: '',
  KAFKA_GROUP_ID: '',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
};
await mkdir(resolve(temp, 'apps/api'), { recursive: true });
await cp(resolve(root, 'apps/api/src'), resolve(temp, 'apps/api/src'), { recursive: true });
await cp(resolve(root, 'packages/contracts'), resolve(temp, 'packages/contracts'), {
  recursive: true,
});
await cp(resolve(root, 'docs'), resolve(temp, 'docs'), { recursive: true });
await copyFile(resolve(root, 'package.json'), resolve(temp, 'package.json'));
await symlink(resolve(root, 'node_modules'), resolve(temp, 'node_modules'), 'dir');
for (const name of ['geo', 'korvet'])
  await copyFile(
    resolve(root, `workshop/solutions/${name}.solution.ts`),
    resolve(temp, `apps/api/src/labs/${name}.ts`),
  );
let child, browser, web;
let logs = '';
async function wait(fn, seconds = 30, label = 'Kondisi belum tercapai') {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      const r = await fn();
      if (r) return r;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(label);
}
async function api(path, method = 'GET', body) {
  const r = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const data = await r.json();
  assert.ok(r.ok, `${path}: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
function start() {
  child = spawn(process.execPath, ['--import', 'tsx', resolve(temp, 'apps/api/src/server.ts')], {
    cwd: temp,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (x) => {
    logs += x;
  });
  child.stderr.on('data', (x) => {
    logs += x;
  });
}
async function stop() {
  if (child?.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      once(child, 'exit'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 15000)),
    ]);
  }
}
async function validate() {
  const state = await api('/workshop/validate', 'POST', {});
  console.log(state.exercises.map((e) => `${e.id}=${e.status}: ${e.message}`).join('\n'));
  assert.ok(
    state.exercises.every((e) => e.status === 'passed'),
    'Empat latihan harus lulus pada Redis/Korvet asli.',
  );
  return state;
}
async function screenshot(page, name) {
  if (await page.locator('.map-wrap').count()) {
    await page.waitForFunction(() => {
      const map = document.querySelector('.map-wrap');
      const tiles = [...document.querySelectorAll('.leaflet-tile')];
      return (
        map?.getAttribute('data-map-mode') === 'online' &&
        map.getAttribute('data-map-status') === 'ready' &&
        tiles.length > 0 &&
        tiles.every(
          (tile) =>
            tile.complete && tile.naturalWidth > 0 && Number(getComputedStyle(tile).opacity) === 1,
        )
      );
    });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => scrollY === 0);
  await page.screenshot({
    path: resolve(root, `test-results/screenshots/${name}.png`),
    fullPage: true,
  });
}
try {
  start();
  await wait(
    async () => (await api('/state')).infra.producer,
    45,
    'Korvet producer tidak tersambung. Periksa advertised host dan Redis JSON.',
  );
  await validate();
  let state = await api('/state');
  assert.equal(state.positionsReady, true);
  const asset = state.assets.find((a) => a.id === 'A-101');
  const original = state.technicians.find((t) => t.id === 'T-01');
  const center = { longitude: asset.longitude, latitude: asset.latitude };
  const originalPosition = { longitude: original.longitude, latitude: original.latitude };
  const farPosition = { longitude: 107.6191, latitude: -6.9175 }; // Bandung, di luar radius Jakarta.
  assert.equal(asset.area, 'Gambir');
  const search = await api('/geo/search', 'POST', { center, radiusKm: 1 });
  assert.ok(search.results.length > 0);
  assert.deepEqual(
    search.results.map((t) => t.id),
    ['T-01', 'T-02'],
  );
  assert.ok(search.results[0].distanceKm > 0.4 && search.results[0].distanceKm < 0.5);
  const wider = await api('/geo/search', 'POST', { center, radiusKm: 3 });
  assert.equal(wider.results.length, 6);
  assert.ok(search.results.every((r, i, arr) => i === 0 || r.distanceKm >= arr[i - 1].distanceKm));
  const empty = await api('/geo/search', 'POST', {
    center: farPosition,
    radiusKm: 1,
  });
  assert.equal(empty.results.length, 0);
  const invalid = await fetch(`${base}/api/technicians/T-01/position`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ longitude: 190, latitude: center.latitude }),
  });
  assert.equal(invalid.status, 400);
  await api('/technicians/T-01/position', 'PUT', farPosition);
  const changed = await api('/geo/search', 'POST', { center, radiusKm: 1 });
  assert.equal(
    changed.results.some((t) => t.id === 'T-01'),
    false,
  );
  await api('/technicians/T-01/position', 'PUT', originalPosition);
  await wait(async () => (await api('/state')).infra.consumer, 20, 'Consumer belum join group.');
  const event = {
    eventId: randomUUID(),
    assetId: 'A-101',
    timestamp: new Date().toISOString(),
    temperatureC: 87.5,
    voltageV: 198.2,
    currentA: 19.1,
  };
  // Dua publish dengan eventId sama: storage boleh dua record; tampilan harus satu.
  await api('/telemetry', 'POST', event);
  await api('/telemetry', 'POST', event);
  await wait(
    async () => (await api('/state')).events.some((e) => e.eventId === event.eventId),
    20,
    'Event tidak sampai consumer.',
  );
  state = await api('/state');
  assert.equal(state.events.filter((e) => e.eventId === event.eventId).length, 1);
  assert.equal(state.alarms.filter((a) => a.eventId === event.eventId).length, 2);
  const storage = await api('/storage');
  assert.ok(storage.entries.some((e) => e.event?.eventId === event.eventId));
  assert.ok(storage.length >= 2);
  assert.ok(state.journeys.find((e) => e.eventId === event.eventId).receivedAt);
  assert.ok(state.journeys.find((e) => e.eventId === event.eventId).storedAt);
  await api('/consumer/restart', 'POST', {});
  await api('/workshop/validate', 'POST', {});
  const afterRestart = { ...event, eventId: randomUUID(), timestamp: new Date().toISOString() };
  await api('/telemetry', 'POST', afterRestart);
  await wait(
    async () => (await api('/state')).events.some((e) => e.eventId === afterRestart.eventId),
    20,
    'Consumer restart gagal.',
  );
  // UI diproksi ke salinan solusi, tidak menyentuh file starter.
  web = spawn(
    process.execPath,
    [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174'],
    { cwd: resolve(root, 'apps/web'), env: { ...process.env, API_PROXY: base }, stdio: 'ignore' },
  );
  await wait(async () => (await fetch('http://localhost:5174')).ok);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [],
    consoleErrors = [],
    networkErrors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/api/'))
      networkErrors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('http://localhost:5174');
  await page.getByRole('heading', { name: 'Ringkasan', exact: true }).waitFor();
  await mkdir(resolve(root, 'test-results/screenshots'), { recursive: true });
  await screenshot(page, 'solution-overview');
  await page.getByRole('link', { name: 'Penugasan Lapangan', exact: true }).click();
  await page.getByRole('button', { name: 'Cari teknisi terdekat' }).click();
  await page.getByText('6 teknisi', { exact: true }).waitFor();
  assert.equal(await page.locator('.technician-row').count(), 6);
  await screenshot(page, 'solution-geo');
  const movedTechnician = await page.locator('.detail-heading h3').textContent();
  await page.getByLabel('Longitude teknisi').fill(String(farPosition.longitude));
  await page.getByLabel('Latitude teknisi').fill(String(farPosition.latitude));
  await page.getByRole('button', { name: 'Perbarui posisi' }).click();
  await page
    .getByText('Posisi tersimpan di Redis. Cari kembali untuk melihat perubahan.')
    .waitFor();
  await page.getByRole('button', { name: 'Cari teknisi terdekat' }).click();
  await page.getByText('5 teknisi', { exact: true }).waitFor();
  assert.equal(
    await page.locator('.technician-row').filter({ hasText: movedTechnician }).count(),
    0,
  );
  await api('/technicians/T-01/position', 'PUT', originalPosition);
  await page.getByRole('link', { name: 'Monitoring Aset', exact: true }).click();
  await page.getByLabel('Skenario simulasi').selectOption('temperature');
  await page.getByRole('button', { name: 'Mulai simulasi' }).click();
  await wait(
    async () => (await api('/state')).counts.sent >= 8,
    30,
    'Simulator tidak mengirim event.',
  );
  await page.getByRole('button', { name: 'Hentikan simulasi' }).click();
  const storageToggle = page.getByRole('button', { name: /Penyimpanan Redis/ });
  if ((await storageToggle.getAttribute('aria-expanded')) !== 'true') await storageToggle.click();
  await page.locator('.storage-entries details').first().waitFor();
  await screenshot(page, 'solution-monitoring');
  await page.setViewportSize({ width: 1366, height: 768 });
  await screenshot(page, 'solution-monitoring-1366');
  const beforeNormal = new Set((await api('/state')).events.map((e) => e.eventId));
  await page.getByLabel('Skenario simulasi').selectOption('normal');
  await page.getByRole('button', { name: 'Mulai simulasi' }).click();
  await wait(
    async () =>
      (await api('/state')).events.some(
        (e) => !beforeNormal.has(e.eventId) && e.temperatureC < 70 && e.voltageV > 220,
      ),
    15,
    'Skenario Normal belum diterima consumer.',
  );
  await page.getByRole('button', { name: 'Hentikan simulasi' }).click();
  const beforeVoltage = new Set((await api('/state')).events.map((e) => e.eventId));
  await page.getByLabel('Skenario simulasi').selectOption('voltage');
  await page.getByRole('button', { name: 'Mulai simulasi' }).click();
  await wait(
    async () => {
      const current = await api('/state');
      return current.events.some(
        (e) =>
          !beforeVoltage.has(e.eventId) &&
          e.voltageV < 210 &&
          current.alarms.some((a) => a.eventId === e.eventId && a.kind === 'voltage'),
      );
    },
    20,
    'Skenario Tegangan turun belum menghasilkan alarm consumer.',
  );
  await page.getByRole('button', { name: 'Hentikan simulasi' }).click();
  await page.getByRole('link', { name: 'Ringkasan', exact: true }).click();
  await screenshot(page, 'solution-overview-1366');
  await page.getByRole('link', { name: 'Penugasan Lapangan', exact: true }).click();
  await page.getByRole('button', { name: 'Cari teknisi terdekat' }).click();
  await page.locator('.technician-row').first().waitFor();
  await screenshot(page, 'solution-geo-1366');
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Overflow horizontal pada laptop.',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(networkErrors, []);
  await browser.close();
  browser = undefined;
  await stop();
  start();
  await wait(async () => (await api('/state')).infra.producer, 40);
  await validate();
  const finalEvent = { ...event, eventId: randomUUID(), timestamp: new Date().toISOString() };
  await api('/telemetry', 'POST', finalEvent);
  await wait(
    async () => (await api('/state')).events.some((e) => e.eventId === finalEvent.eventId),
    20,
    'Consumer tidak pulih setelah restart backend.',
  );
  await api('/data/reset', 'POST', { confirm: labId });
  assert.equal((await api('/storage')).length, 0);
  // Pemeriksaan negatif: fungsi valid secara sintaks tetapi perilaku salah harus gagal.
  await stop();
  const geoFile = resolve(temp, 'apps/api/src/labs/geo.ts');
  const korvetFile = resolve(temp, 'apps/api/src/labs/korvet.ts');
  const geoSolution = await readFile(geoFile, 'utf8');
  const korvetSolution = await readFile(korvetFile, 'utf8');
  await writeFile(
    geoFile,
    geoSolution.replace('longitude: position.longitude', 'longitude: 110.01'),
  );
  await writeFile(korvetFile, korvetSolution.replace('key: event.assetId', "key: 'A-101'"));
  start();
  await wait(async () => (await api('/state')).infra.producer, 40);
  const incorrect = await api('/workshop/validate', 'POST', {});
  assert.equal(incorrect.exercises.find((e) => e.id === 'GEO-01').status, 'incorrect');
  assert.equal(incorrect.exercises.find((e) => e.id === 'GEO-02').status, 'dependency');
  assert.equal(incorrect.exercises.find((e) => e.id === 'KORVET-01').status, 'incorrect');
  assert.equal(incorrect.exercises.find((e) => e.id === 'KORVET-02').status, 'passed');
  assert.equal(incorrect.positionsReady, false);
  await stop();
  await writeFile(geoFile, geoSolution);
  await writeFile(
    korvetFile,
    korvetSolution.replace('await consumer.run({', 'return; await consumer.run({'),
  );
  start();
  await wait(async () => (await api('/state')).infra.producer, 40);
  const noConsumer = await api('/workshop/validate', 'POST', {});
  assert.equal(noConsumer.exercises.find((e) => e.id === 'KORVET-02').status, 'incorrect');
  assert.equal(noConsumer.infra.consumer, false);
  const denied = await fetch(`${base}/api/consumer/restart`, { method: 'POST' });
  assert.equal(denied.status, 423);
  await api('/data/reset', 'POST', { confirm: labId });
  console.log(
    'LULUS: solusi terisolasi, radius/kosong/update/input, producer→stream→consumer→SSE/UI, alarm, deduplikasi, simulator, restart dan reset namespace.',
  );
  console.log(
    'LULUS: koordinat/key hardcoded ditolak, dependensi dibedakan, subscribe tanpa run gagal dengan timeout dan consumer tetap terkunci.',
  );
} catch (error) {
  console.error(error);
  console.error(logs.slice(-4000));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (child?.exitCode === null) {
    await api('/data/reset', 'POST', { confirm: labId }).catch(() => {});
    await stop().catch(() => child.kill('SIGKILL'));
  }
  if (web?.exitCode === null) web.kill('SIGTERM');
  await rm(temp, { recursive: true, force: true });
}
