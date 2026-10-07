import { createClient } from 'redis';
import { Kafka, Partitioners, logLevel, type Consumer, type Producer } from 'kafkajs';
import { config } from './config.js';
import { InfrastructureError, timeout } from '../shared/errors.js';

export function makeRedis(reconnect = false) {
  const client = createClient({
    url: config.redisUrl,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
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
  redis = makeRedis(true);
  producer = makeProducer();
  redisReady = false;
  korvetReady = false;
  producerReady = false;
  private connecting?: Promise<void>;
  private closed = false;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private changed: () => void) {
    this.redis.on('ready', () => {
      this.redisReady = true;
      changed();
    });
    this.redis.on('error', () => {
      this.redisReady = false;
      changed();
    });
    this.redis.on('end', () => {
      this.redisReady = false;
      changed();
    });
    this.producer.on(this.producer.events.DISCONNECT, () => {
      this.producerReady = false;
      changed();
    });
  }
  start(): void {
    void this.redis.connect().catch(() => {});
    void this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, 5000);
  }
  async refresh(): Promise<void> {
    if (this.closed || this.connecting) return this.connecting;
    this.connecting = (async () => {
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
      if (this.redis.isReady) {
        try {
          await timeout(this.redis.ping(), 2000);
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
    if (!this.redisReady || !this.redis.isReady)
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
    if (this.redis.isOpen) await this.redis.disconnect().catch(() => {});
  }
}
