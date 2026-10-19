import { createClient } from 'redis';
import { Kafka, Partitioners, logLevel, type Consumer, type Producer } from 'kafkajs';
import { config } from './config.js';
import { InfrastructureError, timeout } from '../shared/errors.js';

export function makeRedis(reconnect = false) {
  if (config.redis.issue || !config.redis.options)
    throw new InfrastructureError(config.redis.issue || 'Isi REDIS_URL pada .env.');
  const client = createClient({
    ...config.redis.options,
    disableOfflineQueue: true,
    socket: {
      ...config.redis.options.socket,
      connectTimeout: config.redis.connectTimeout,
      reconnectStrategy: reconnect ? (retries) => Math.min(300 + retries * 300, 3000) : false,
    },
  });
  client.on('error', () => {}); // URI dan kredensial tetap berada pada backend.
  return client;
}
export function makeKafka() {
  return new Kafka({
    clientId: `${config.labId}-api`,
    brokers: config.brokers,
    ssl: config.ssl,
    sasl: config.sasl,
    connectionTimeout: 2000,
    requestTimeout: 3500,
    retry: { retries: 2, initialRetryTime: 200, maxRetryTime: 1500 },
    logLevel: logLevel.NOTHING,
  });
}
export function makeProducer(kafka = makeKafka()): Producer {
  return kafka.producer({
    idempotent: false,
    allowAutoTopicCreation: false,
    createPartitioner: Partitioners.DefaultPartitioner,
    maxInFlightRequests: 1,
  });
}
export function makeConsumer(groupId: string, kafka = makeKafka()): Consumer {
  return kafka.consumer({
    groupId,
    allowAutoTopicCreation: false,
    sessionTimeout: 12000,
    heartbeatInterval: 2000,
    rebalanceTimeout: 12000,
    maxWaitTimeInMs: 700,
    retry: { retries: 2, initialRetryTime: 200, restartOnFailure: async () => true },
  });
}
export async function ensureTopic(topic: string, kafka = makeKafka()): Promise<void> {
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      timeout: 5000,
      topics: [
        {
          topic,
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [
            { name: 'remote.storage.enable', value: 'false' },
            { name: 'storage.compression.type', value: 'none' },
            { name: 'retention.ms', value: '86400000' },
          ],
        },
      ],
    });
    const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
    if (metadata.topics[0]?.partitions.length !== 1)
      throw new Error('Topic lab harus satu partition.');
  } finally {
    await admin.disconnect().catch(() => {});
  }
}
export async function deleteFixtureTopics(topics: string[], groups: string[]): Promise<void> {
  if (
    !topics.every((t) => t.startsWith(`${config.labId}-check-`)) ||
    !groups.every((g) => g.startsWith(`${config.labId}-check-`))
  )
    throw new Error('Namespace fixture tidak benar.');
  const admin = makeKafka().admin();
  try {
    await admin.connect();
    if (groups.length) await admin.deleteGroups(groups).catch(() => {});
    if (topics.length) await admin.deleteTopics({ topics, timeout: 5000 });
  } finally {
    await admin.disconnect().catch(() => {});
  }
}
export class Infrastructure {
  private redisClient?: ReturnType<typeof makeRedis>;
  producer = makeProducer();
  redisReady = false;
  korvetReady = false;
  producerReady = false;
  private connecting?: Promise<void>;
  private closed = false;
  private timer?: ReturnType<typeof setInterval>;
  private streamingEnabled = false;
  constructor(private changed: () => void) {
    this.producer.on(this.producer.events.DISCONNECT, () => {
      this.producerReady = false;
      changed();
    });
  }
  get redis(): ReturnType<typeof makeRedis> {
    if (this.redisClient) return this.redisClient;
    const redis = makeRedis(true);
    redis.on('ready', () => {
      this.redisReady = true;
      this.changed();
    });
    redis.on('error', () => {
      this.redisReady = false;
      this.changed();
    });
    redis.on('end', () => {
      this.redisReady = false;
      this.changed();
    });
    this.redisClient = redis;
    return redis;
  }
  /** Dibuka hanya setelah peserta memeriksa konfigurasi; startup tidak membuka socket Redis. */
  async connectRedis(): Promise<void> {
    if (this.closed) throw new InfrastructureError('Backend sedang dihentikan.');
    const redis = this.redis;
    if (redis.isReady) return;
    if (redis.isOpen) await redis.disconnect();
    try {
      await timeout(redis.connect(), config.redis.connectTimeout + 1000);
    } catch {
      if (redis.isOpen) await redis.disconnect().catch(() => {});
      throw new InfrastructureError(
        'Koneksi utama Redis belum siap. Periksa endpoint dan jaringan, lalu periksa koneksi kembali.',
      );
    }
  }
  start(): void {
    void this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, 5000);
  }
  enableStreaming(): void {
    this.streamingEnabled = true;
    void this.refresh();
  }
  async refresh(): Promise<void> {
    if (this.closed || this.connecting) return this.connecting;
    this.connecting = (async () => {
      if (this.streamingEnabled)
        try {
          await timeout(ensureTopic(config.topic), 9000);
          this.korvetReady = true;
          if (!this.producerReady) {
            await this.producer.connect();
            this.producerReady = true;
          }
        } catch {
          this.korvetReady = false;
          this.producerReady = false;
        }
      if (this.redisClient?.isReady) {
        try {
          await timeout(this.redisClient.ping(), 2000);
          this.redisReady = true;
        } catch {
          this.redisReady = false;
        }
      } else this.redisReady = false;
      this.changed();
    })().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }
  requireRedis(): void {
    if (!this.redisReady || !this.redisClient?.isReady)
      throw new InfrastructureError('Redis tidak tersambung. Periksa REDIS_URL dan layanan Redis.');
  }
  requireKorvet(): void {
    if (!this.korvetReady || !this.producerReady)
      throw new InfrastructureError(
        'Korvet tidak tersambung. Periksa KAFKA_BROKERS dan KORVET_BROKER_ADVERTISED_HOST.',
      );
  }
  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.timer);
    await this.connecting?.catch(() => {});
    await this.producer.disconnect().catch(() => {});
    if (this.redisClient?.isOpen) await this.redisClient.disconnect().catch(() => {});
  }
}
