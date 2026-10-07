import { config } from '../infrastructure/config.js';
import { makeRedis, makeKafka, ensureTopic } from '../infrastructure/clients.js';
import { timeout } from '../shared/errors.js';

// Beroperasi hanya pada nama yang diturunkan dari LAB_ID; tidak memakai FLUSHDB/FLUSHALL.
export async function resetLabData(confirm: string): Promise<void> {
  if (confirm !== config.labId) throw new Error('Konfirmasi LAB_ID tidak sesuai.');
  const redis = makeRedis();
  const admin = makeKafka().admin();
  try {
    await timeout(redis.connect(), 3000);
    await admin.connect();
    const topics = (await admin.listTopics()).filter(
      (t) => t === config.topic || t.startsWith(`${config.labId}-check-`),
    );
    const groups = (await admin.listGroups()).groups
      .map((g) => g.groupId)
      .filter((g) => g === config.groupId || g.startsWith(`${config.labId}-check-`));
    if (groups.length) await admin.deleteGroups(groups);
    if (topics.length) await admin.deleteTopics({ topics, timeout: 5000 });
    await redis.del([config.geoKey, config.positionsKey]);
    for await (const keys of redis.scanIterator({
      MATCH: `fieldops:${config.labId}:check:*`,
      COUNT: 100,
    }))
      await redis.del(keys);
    await ensureTopic(config.topic);
  } finally {
    await admin.disconnect().catch(() => {});
    if (redis.isOpen) await redis.disconnect().catch(() => {});
  }
}
