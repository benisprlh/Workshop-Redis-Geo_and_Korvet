import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';
loadEnv({
  path: resolve(process.cwd(), process.cwd().endsWith('/apps/api') ? '../../.env' : '.env'),
});

const name = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/);
const labId = name.parse(process.env.LAB_ID || 'fieldops-demo');
const topic = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/)
  .parse(process.env.TELEMETRY_TOPIC || `${labId}-telemetry`);
const groupId = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/)
  .parse(process.env.KAFKA_GROUP_ID || `${labId}-dashboard`);
// Prefix mencegah benturan nama; bukan isolasi akses. Custom endpoint harus dikelola instruktur.
if (!topic.startsWith(`${labId}-`) || !groupId.startsWith(`${labId}-`))
  throw new Error('TELEMETRY_TOPIC dan KAFKA_GROUP_ID harus dimulai LAB_ID- agar reset aman.');
export const config = {
  labId,
  topic,
  groupId,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  namespace: name.parse(process.env.KORVET_NAMESPACE || 'korvet'),
  port: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.API_PORT || 3001),
  geoKey: `fieldops:${labId}:technicians:geo`,
  positionsKey: `fieldops:${labId}:technicians:positions`,
  checkTimeoutMs: 20000,
  commandTimeoutMs: 5500,
  ssl: process.env.KAFKA_SSL === 'true',
  sasl:
    process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD
      ? {
          mechanism: 'plain' as const,
          username: process.env.KAFKA_USERNAME,
          password: process.env.KAFKA_PASSWORD,
        }
      : undefined,
};
export type RuntimeConfig = typeof config;
// Prefix partition resmi; storage.ts menemukan layout fisik aktual melalui command read-only.
export const streamKey = (topicName: string, namespace = config.namespace) =>
  `${namespace}:storage:local:${topicName}:0`;
