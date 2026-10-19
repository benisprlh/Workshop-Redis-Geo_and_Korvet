import { randomUUID } from 'node:crypto';
import type { RedisConnection } from '@fieldops/contracts';
import { config } from '../infrastructure/config.js';
import { makeProducer, ensureTopic, deleteFixtureTopics } from '../infrastructure/clients.js';
import { storedEvent } from '../infrastructure/stream-storage.js';
import { delay, InfrastructureError, timeout } from '../shared/errors.js';
import type { LabRedis } from './support.js';

export function initialKorvetConnection(): NonNullable<RedisConnection['korvet']> {
  return {
    status: 'checking',
    brokers: config.kafkaIssue ? [] : [...config.brokers],
    managed:
      Boolean(process.env.KORVET_CONTROL_URL) &&
      config.brokers.length === 1 &&
      config.brokers[0] === (process.env.KORVET_MANAGED_BROKER || 'korvet:9092'),
    message: 'Memeriksa Korvet dan lokasi penyimpanan event…',
  };
}

/** Fixture koneksi saja; tidak mengisi latihan dan tidak mengirim event bisnis. */
export async function checkKorvetConnection(
  redis: LabRedis,
): Promise<NonNullable<RedisConnection['korvet']>> {
  const result = initialKorvetConnection();
  const topic = `${config.labId}-check-storage-${randomUUID().slice(0, 8)}`;
  let created = false;
  let producer: ReturnType<typeof makeProducer> | undefined;
  let phase: 'configuration' | 'broker' | 'storage' = 'configuration';
  try {
    if (config.kafkaIssue) throw new InfrastructureError(config.kafkaIssue);
    if (result.managed) {
      const socket = config.redis.options?.socket;
      const pem = (value: unknown): string | undefined =>
        Buffer.isBuffer(value)
          ? value.toString('utf8')
          : typeof value === 'string'
            ? value
            : undefined;
      const tls = socket && 'tls' in socket && socket.tls ? socket : undefined;
      const response = await fetch(new URL('/configuration', process.env.KORVET_CONTROL_URL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: config.redis.url,
          namespace: config.namespace,
          servername: tls?.servername,
          ca: pem(Array.isArray(tls?.ca) ? tls.ca[0] : tls?.ca),
          cert: pem(tls?.cert),
          key: pem(tls?.key),
        }),
        signal: AbortSignal.timeout(22000),
      }).catch(() => {
        throw new InfrastructureError(
          'Konfigurasi Korvet belum diterapkan. Periksa layanan korvet dan redis-link, lalu tekan Periksa koneksi Redis kembali.',
        );
      });
      if (!response.ok)
        throw new InfrastructureError(
          'Korvet belum dapat mengganti penyimpanan Redis. Periksa layanan korvet dan redis-link, lalu ulangi pemeriksaan.',
        );
      await response.arrayBuffer();
    }
    phase = 'broker';
    const deadline = Date.now() + (result.managed ? 30000 : 12000);
    while (true) {
      try {
        await timeout(ensureTopic(topic), 6000);
        created = true;
        break;
      } catch {
        if (Date.now() > deadline) throw new Error();
        await delay(400);
      }
    }
    producer = makeProducer();
    await timeout(producer.connect(), 4500);
    phase = 'storage';
    const event = {
      eventId: randomUUID(),
      assetId: 'A-101',
      timestamp: new Date().toISOString(),
      temperatureC: 64,
      voltageV: 228,
      currentA: 18,
    };
    await timeout(
      producer.send({ topic, messages: [{ key: event.assetId, value: JSON.stringify(event) }] }),
      5500,
    );
    const deadlineStorage = Date.now() + 3500;
    let proof;
    do {
      proof = await timeout(storedEvent(redis, topic, event.eventId), 2500);
      if (proof) break;
      await delay(150);
    } while (Date.now() < deadlineStorage);
    if (!proof || proof.key !== event.assetId) throw new Error();
    result.status = 'passed';
    result.message =
      'Korvet terverifikasi. Event uji KafkaJS ditemukan pada Redis yang sama dengan endpoint backend; fixture dibersihkan.';
  } catch (error) {
    result.status = 'failed';
    result.message =
      error instanceof InfrastructureError
        ? error.message
        : phase === 'storage'
          ? `Korvet tersambung, tetapi event uji tidak ditemukan di ${config.redis.endpoint.host}:${config.redis.endpoint.port} database ${config.redis.endpoint.database}. Penyimpanan broker atau KORVET_NAMESPACE berbeda. ${result.managed ? 'Ulangi pemeriksaan koneksi dan periksa layanan redis-link.' : 'Minta instruktur menyamakan penyimpanan Korvet dengan REDIS_URL; UI tidak mengubah broker eksternal.'}`
          : 'Korvet tidak dapat dijangkau. Periksa KAFKA_BROKERS, layanan Korvet, dan advertised broker address yang dapat dijangkau backend.';
  } finally {
    if (producer) await timeout(producer.disconnect(), 2000).catch(() => {});
    if (created)
      await timeout(deleteFixtureTopics([topic], []), 6000).catch(() => {
        result.status = 'failed';
        result.message =
          'Event uji Korvet diperiksa, tetapi cleanup topic belum selesai. Pulihkan koneksi broker lalu periksa kembali.';
      });
  }
  return result;
}
