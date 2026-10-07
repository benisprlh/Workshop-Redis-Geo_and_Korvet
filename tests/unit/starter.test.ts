import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, copyFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseGeoReply,
  parseTelemetry,
  coordinatesSchema,
} from '../../apps/api/src/workshop/support.js';
import { State } from '../../apps/api/src/operations/state.js';
import type { Producer, Consumer } from 'kafkajs';
import type { LabRedis, TelemetryEvent } from '../../apps/api/src/workshop/support.js';

test('starter: empat fungsi valid dan terkunci', async () => {
  // Uji template reset dalam salinan terpisah agar edit peserta tidak dianggap kegagalan test.
  const fixture = await mkdtemp(resolve(tmpdir(), 'fieldops-starter-'));
  try {
    await cp('apps/api/src', resolve(fixture, 'src'), { recursive: true });
    await copyFile('package.json', resolve(fixture, 'package.json'));
    await symlink(resolve('node_modules'), resolve(fixture, 'node_modules'), 'dir');
    for (const module of ['geo', 'korvet']) {
      await copyFile(`workshop/starters/${module}.ts`, resolve(fixture, `src/labs/${module}.ts`));
    }
    const { saveTechnicianPosition, findNearbyTechnicians } = await import(
      pathToFileURL(resolve(fixture, 'src/labs/geo.ts')).href
    );
    const { publishTelemetry, consumeTelemetry } = await import(
      pathToFileURL(resolve(fixture, 'src/labs/korvet.ts')).href
    );
    const { WorkshopTodoError } = await import(
      pathToFileURL(resolve(fixture, 'src/workshop/support.ts')).href
    );
    const redis = {} as LabRedis,
      producer = {} as Producer,
      consumer = {} as Consumer;
    const event = {
      eventId: 'e568d7b0-983f-4ad0-b169-ac9d89793096',
      assetId: 'A-101',
      timestamp: new Date().toISOString(),
      temperatureC: 65,
      voltageV: 228,
      currentA: 18,
    };
    await assert.rejects(
      saveTechnicianPosition(redis, 'isolated', 'T-01', { longitude: 110, latitude: -7 }),
      (e) => e instanceof WorkshopTodoError && e.exerciseId === 'GEO-01',
    );
    await assert.rejects(
      findNearbyTechnicians(redis, 'isolated', { longitude: 110, latitude: -7 }, 3),
      (e) => e instanceof WorkshopTodoError && e.exerciseId === 'GEO-02',
    );
    await assert.rejects(
      publishTelemetry(producer, 'isolated', event),
      (e) => e instanceof WorkshopTodoError && e.exerciseId === 'KORVET-01',
    );
    await assert.rejects(
      consumeTelemetry(consumer, 'isolated', async () => {}),
      (e) => e instanceof WorkshopTodoError && e.exerciseId === 'KORVET-02',
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
test('helper memvalidasi koordinat dan menolak payload rusak', () => {
  assert.equal(coordinatesSchema.safeParse({ longitude: 190, latitude: -7 }).success, false);
  assert.equal(coordinatesSchema.safeParse({ longitude: 110, latitude: 89 }).success, false);
  assert.equal(parseTelemetry(Buffer.from('bukan JSON')), undefined);
  assert.equal(parseTelemetry(null), undefined);
  assert.deepEqual(parseGeoReply([['T-01', '0.5200', ['110.01', '-7.01']]]), [
    { technicianId: 'T-01', distanceKm: 0.52, longitude: 110.01, latitude: -7.01 },
  ]);
  assert.throws(() => parseGeoReply([['T-01', '0.5']]), /WITHDIST/);
});
test('consumer state melakukan deduplikasi eventId dan threshold', async () => {
  const state = new State();
  const event: TelemetryEvent = {
    eventId: '6d8ea8e0-82cd-4a56-9450-2094ec9bc9e3',
    assetId: 'A-101',
    timestamp: new Date().toISOString(),
    temperatureC: 86,
    voltageV: 195,
    currentA: 18,
  };
  await state.received(event);
  await state.received(event);
  assert.equal(state.data.events.length, 1);
  assert.equal(state.data.counts.received, 1);
  assert.equal(state.data.alarms.length, 2);
  assert.equal(state.data.journeys[0].sentAt, undefined);
  assert.ok(state.data.journeys[0].receivedAt);
});
