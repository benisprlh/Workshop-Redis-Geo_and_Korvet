import { randomUUID } from 'node:crypto';
import type { Consumer, Producer } from 'kafkajs';
import { saveTechnicianPosition, findNearbyTechnicians } from '../labs/geo.js';
import { publishTelemetry, consumeTelemetry } from '../labs/korvet.js';
import { config } from '../infrastructure/config.js';
import {
  makeRedis,
  makeProducer,
  makeConsumer,
  ensureTopic,
  deleteFixtureTopics,
  type Infrastructure,
} from '../infrastructure/clients.js';
import {
  parseGeoReply,
  parseTelemetry,
  WorkshopTodoError,
  type LabRedis,
  type Coordinates,
  type TelemetryEvent,
} from './support.js';
import { State } from '../operations/state.js';
import { storedEvent } from '../infrastructure/stream-storage.js';
import { CheckError, InfrastructureError, timeout, waitUntil } from '../shared/errors.js';
import type { ExerciseId, Exercise } from '@fieldops/contracts';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CheckError(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  check(JSON.stringify(actual) === JSON.stringify(expected), message);
}
function near(a: number, b: number, tolerance = 0.00001) {
  return Number.isFinite(a) && Math.abs(a - b) < tolerance;
}

// Pengamatan panggilan tetap memakai client Redis asli. Tidak memeriksa teks source/TODO.
function observe(redis: LabRedis, calls: string[][]): LabRedis {
  return new Proxy(redis, {
    get(target, property) {
      if (property === 'geoAdd')
        return (...args: Parameters<LabRedis['geoAdd']>) => {
          calls.push(['GEOADD']);
          return target.geoAdd(...args);
        };
      if (property === 'sendCommand')
        return (args: string[]) => {
          calls.push(args.map(String));
          return target.sendCommand(args);
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function validateGeo(id: 'GEO-01' | 'GEO-02', redis: LabRedis, key: string): Promise<void> {
  const calls: string[][] = [];
  const client = observe(redis, calls);
  const centers: Coordinates[] = [
    { longitude: 110.01, latitude: -7.01 },
    { longitude: 12.4, latitude: 48.3 },
  ];
  if (id === 'GEO-01') {
    for (const center of centers) {
      await redis.del(key);
      for (const [technicianId, offset] of [
        ['T-71', 0.004],
        ['T-72', -0.014],
      ] as const) {
        const p = { longitude: center.longitude + offset, latitude: center.latitude - offset / 2 };
        await saveTechnicianPosition(client, key, technicianId, p);
        const actual = (await redis.geoPos(key, technicianId))[0];
        check(
          actual &&
            near(Number(actual.longitude), p.longitude) &&
            near(Number(actual.latitude), p.latitude),
          'GEO-01: posisi tidak tersimpan sesuai input. Gunakan key, member, longitude, latitude yang diberikan.',
        );
      }
      await saveTechnicianPosition(client, key, 'T-71', center);
      const updated = (await redis.geoPos(key, 'T-71'))[0];
      check(
        updated &&
          near(Number(updated.longitude), center.longitude) &&
          near(Number(updated.latitude), center.latitude),
        'GEO-01: update ID yang sama harus mengubah koordinat.',
      );
      check(
        (await redis.zCard(key)) === 2,
        'GEO-01: jangan menduplikasi ID atau menambahkan member lain.',
      );
    }
    check(
      calls.filter((c) => c[0].toUpperCase() === 'GEOADD').length >= 6,
      'GEO-01: gunakan GEOADD pada client yang diberikan.',
    );
    return;
  }
  for (const center of centers) {
    await redis.del(key);
    const fixtures = [
      ['T-71', 0.003],
      ['T-72', 0.016],
      ['T-73', 0.045],
      ['T-74', 0.14],
    ] as const;
    for (const [technicianId, offset] of fixtures)
      await saveTechnicianPosition(redis, key, technicianId, {
        longitude: center.longitude + offset,
        latitude: center.latitude,
      });
    for (const [origin, radius] of [
      [center, 1],
      [center, 3],
      [center, 10],
      [{ longitude: center.longitude - 0.3, latitude: center.latitude }, 1],
    ] as const) {
      const expected = parseGeoReply(
        await redis.sendCommand([
          'GEOSEARCH',
          key,
          'FROMLONLAT',
          String(origin.longitude),
          String(origin.latitude),
          'BYRADIUS',
          String(radius),
          'km',
          'ASC',
          'WITHDIST',
          'WITHCOORD',
        ]),
      );
      const actual = await findNearbyTechnicians(client, key, origin, radius);
      check(Array.isArray(actual), 'GEO-02: kembalikan array GeoHit, termasuk [] ketika kosong.');
      equal(
        actual.map((h) => h.technicianId),
        expected.map((h) => h.technicianId),
        'GEO-02: radius atau urutan salah. Gunakan center/radius input, satuan km, dan ASC.',
      );
      actual.forEach((h, i) =>
        check(
          near(h.distanceKm, expected[i].distanceKm, 0.001) &&
            near(h.longitude, expected[i].longitude) &&
            near(h.latitude, expected[i].latitude),
          'GEO-02: sertakan WITHDIST/WITHCOORD dan parseGeoReply.',
        ),
      );
    }
  }
  check(
    calls.length >= 8 &&
      calls.every(
        (c) =>
          c[0].toUpperCase() === 'GEOSEARCH' &&
          ['FROMLONLAT', 'BYRADIUS', 'ASC', 'WITHDIST', 'WITHCOORD'].every((flag) =>
            c.map((x) => x.toUpperCase()).includes(flag),
          ) &&
          c.includes('km'),
      ),
    'GEO-02: gunakan GEOSEARCH dengan FROMLONLAT, BYRADIUS, km, ASC, WITHDIST, WITHCOORD.',
  );
}

function fixtureEvent(assetId: string, temperatureC: number): TelemetryEvent {
  return {
    eventId: randomUUID(),
    assetId,
    timestamp: new Date().toISOString(),
    temperatureC,
    voltageV: temperatureC > 80 ? 198.7 : 229.1,
    currentA: 16.3,
  };
}
async function validateKorvet(
  id: 'KORVET-01' | 'KORVET-02',
  redis: LabRedis,
  topic: string,
  producer: Producer,
  consumer: Consumer,
): Promise<void> {
  const events = [fixtureEvent('A-101', 63.4), fixtureEvent('A-102', 86.2)];
  const received = new Map<string, { event: TelemetryEvent; key?: string }>();
  if (id === 'KORVET-01') {
    // Consumer uji lengkap, hanya digunakan oleh validator.
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ message }) => {
        const event = parseTelemetry(message.value);
        if (event) received.set(event.eventId, { event, key: message.key?.toString() });
      },
    });
    for (const event of events) await publishTelemetry(producer, topic, event);
  } else {
    await consumeTelemetry(consumer, topic, async (event) => {
      received.set(event.eventId, { event });
    });
    // Producer uji lengkap; tidak pernah menjadi fallback operasi aplikasi.
    await producer.send({
      topic,
      messages: [
        { key: 'A-101', value: 'payload tidak valid' },
        ...events.map((event) => ({ key: event.assetId, value: JSON.stringify(event) })),
      ],
    });
  }
  await waitUntil(
    () => events.every((e) => received.has(e.eventId)),
    12000,
    `${id}: dua eventId harus mencapai consumer. Periksa topic, JSON, subscribe, run, dan callback.`,
  );
  for (const event of events) {
    equal(
      received.get(event.eventId)?.event,
      event,
      `${id}: payload yang diterima berbeda. Teruskan event lengkap dari parameter, tanpa nilai tetap.`,
    );
    if (id === 'KORVET-01')
      equal(
        received.get(event.eventId)?.key,
        event.assetId,
        'KORVET-01: key Kafka harus memakai event.assetId dari parameter.',
      );
    const stored = await storedEvent(redis, topic, event.eventId);
    check(
      stored,
      `${id}: eventId tidak ditemukan pada Redis Stream aktual. Periksa namespace dan compression none.`,
    );
    equal(stored.event, event, `${id}: JSON yang tersimpan harus sama dengan input.`);
    equal(stored.key, event.assetId, `${id}: key yang tersimpan harus berupa assetId.`);
  }
  equal(received.size, 2, 'KORVET-02: abaikan payload tidak valid dengan parseTelemetry.');
}

// Semua resource pemeriksaan terisolasi dan ditutup meskipun pemeriksaan gagal.
export class Validator {
  constructor(
    private state: State,
    private infra: Infrastructure,
  ) {}
  async run(): Promise<Exercise[]> {
    if (this.state.data.checking) throw new CheckError('Pemeriksaan masih berjalan.');
    this.state.data.checking = true;
    this.state.emit();
    try {
      await this.infra.refresh();
      for (const id of ['GEO-01', 'GEO-02', 'KORVET-01', 'KORVET-02'] as ExerciseId[])
        await this.one(id);
      return this.state.data.exercises;
    } finally {
      this.state.data.checking = false;
      this.state.emit();
    }
  }
  private async one(id: ExerciseId): Promise<void> {
    const exercise = this.state.exercise(id);
    if (id === 'GEO-02' && !this.state.passed('GEO-01')) {
      Object.assign(exercise, {
        status: 'dependency',
        message: 'Selesaikan GEO-01 untuk menyiapkan posisi fixture.',
      });
      this.state.emit();
      return;
    }
    exercise.status = 'checking';
    this.state.emit();
    const suffix = randomUUID().slice(0, 8);
    const key = `fieldops:${config.labId}:check:${suffix}:geo`;
    const topic = `${config.labId}-check-${id.toLowerCase()}-${suffix}`;
    const group = `${topic}-group`;
    const redis = makeRedis();
    let producer: Producer | undefined;
    let consumer: Consumer | undefined;
    let topicCreated = false;
    try {
      if (id.startsWith('GEO')) this.infra.requireRedis();
      else {
        this.infra.requireRedis();
        this.infra.requireKorvet();
      }
      const operation = (async () => {
        await redis.connect();
        if (id === 'GEO-01' || id === 'GEO-02') await validateGeo(id, redis, key);
        else {
          await ensureTopic(topic);
          topicCreated = true;
          producer = makeProducer();
          consumer = makeConsumer(group);
          await producer.connect();
          await consumer.connect();
          await validateKorvet(id, redis, topic, producer, consumer);
        }
      })();
      await timeout(
        operation,
        config.checkTimeoutMs,
        'Pemeriksaan melewati 20 detik. Periksa await, callback, dan koneksi lab.',
      );
      Object.assign(exercise, {
        status: 'passed',
        message: 'Lulus pemeriksaan perilaku terhadap infrastruktur lab.',
      });
    } catch (error) {
      if (error instanceof WorkshopTodoError)
        Object.assign(exercise, { status: 'todo', message: error.message });
      else if (
        error instanceof InfrastructureError ||
        !redis.isReady ||
        (id.startsWith('KORVET') && !this.infra.korvetReady)
      )
        Object.assign(exercise, {
          status: 'infrastructure',
          message:
            'Infrastruktur tidak tersambung. Periksa Redis/Korvet, kredensial, TLS, dan advertised host.',
        });
      else
        Object.assign(exercise, {
          status: 'incorrect',
          message:
            error instanceof CheckError
              ? error.message
              : 'Implementasi belum benar. Periksa API, parameter, await, dan return/callback. Batas waktu tiap latihan 20 detik.',
        });
    } finally {
      const cleanup = async () => {
        if (consumer) await consumer.disconnect().catch(() => {});
        if (producer) await producer.disconnect().catch(() => {});
        if (redis.isReady) await redis.del(key).catch(() => {});
        if (topicCreated) await deleteFixtureTopics([topic], [group]);
      };
      try {
        await timeout(cleanup(), 8000);
      } catch {
        this.state.activity(
          `Cleanup fixture ${id} belum selesai; instruktur dapat menjalankan data:reset.`,
          'warning',
        );
      }
      if (redis.isOpen) await redis.disconnect().catch(() => {});
      exercise.checkedAt = new Date().toISOString();
      this.state.emit();
    }
  }
}
