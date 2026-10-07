import { config, streamKey } from './config.js';
import type { LabRedis } from '../workshop/support.js';
import { parseTelemetry } from '../workshop/support.js';
import type { StorageSnapshot, StorageEntry } from '@fieldops/contracts';

// Prefix resmi partition v0.19; image yang diuji memakai akhiran segment ID juga
// ketika remoteStorageEnabled=false. Temukan key aktual, jangan mengarang segment ID.
// SCAN dibatasi tepat pada topic/partition lab. Tidak ada pencarian seluruh database.
export async function partitionStreams(redis: LabRedis, topic: string): Promise<string[]> {
  const prefix = streamKey(topic);
  const keys: string[] = [];
  if ((await redis.type(prefix)) === 'stream') keys.push(prefix);
  for await (const key of redis.scanIterator({ MATCH: `${prefix}:*`, COUNT: 100 })) {
    if (/^\d+$/.test(key.slice(prefix.length + 1)) && (await redis.type(key)) === 'stream')
      keys.push(key);
  }
  return keys.sort(
    (a, b) => Number(a.slice(prefix.length + 1) || -1) - Number(b.slice(prefix.length + 1) || -1),
  );
}
// Seluruh command di panel storage hanya read-only: TYPE, SCAN terbatas, XLEN, XRANGE.
export async function inspectStream(
  redis: LabRedis,
  topic = config.topic,
  limit = 8,
): Promise<StorageSnapshot> {
  const keys = await partitionStreams(redis, topic);
  const streams = await Promise.all(
    keys.map(async (key) => ({ key, length: await redis.xLen(key) })),
  );
  const entries: StorageEntry[] = [];
  for (const key of keys.slice().reverse()) {
    const remaining = limit - entries.length;
    if (remaining <= 0) break;
    const recent = await redis.xRevRange(key, '+', '-', { COUNT: remaining });
    const rows = recent.length
      ? await redis.xRange(key, recent.at(-1)!.id, '+', { COUNT: remaining })
      : [];
    entries.unshift(
      ...rows.map((row) => ({
        id: row.id,
        streamKey: key,
        key: row.message.key,
        timestamp: row.message.timestamp,
        event: parseTelemetry(row.message.value ? Buffer.from(row.message.value) : null),
        fields: row.message,
      })),
    );
  }
  const active = streams.at(-1);
  return {
    streamKey: active?.key || `Belum ada stream untuk ${topic}`,
    length: active?.length || 0,
    streams,
    entries,
    checkedAt: new Date().toISOString(),
  };
}
export async function storedEvent(
  redis: LabRedis,
  topic: string,
  eventId: string,
): Promise<StorageEntry | undefined> {
  return (await inspectStream(redis, topic, 100)).entries.find(
    (row) => row.event?.eventId === eventId,
  );
}
