import type { Hint } from '@fieldops/contracts';

export const hints: Hint[] = [
  {
    id: 'GEO-01',
    title: 'Simpan posisi teknisi',
    levels: [
      'Redis GEO memakai sorted set khusus. Member adalah ID teknisi; update memakai ID yang sama.',
      'Gunakan redis.geoAdd(key, { longitude, latitude, member }). Pada command Redis, longitude mendahului latitude.',
      'await redis.geoAdd(key, { longitude: position.…, latitude: position.…, member: … });',
    ],
  },
  {
    id: 'GEO-02',
    title: 'Cari teknisi dalam radius',
    levels: [
      'Pusat pencarian berupa koordinat gangguan. Redis menentukan jarak dan mengurutkan hasil.',
      'GEOSEARCH key FROMLONLAT lon lat BYRADIUS radius km ASC WITHDIST WITHCOORD. sendCommand menerima array string.',
      'const reply = await redis.sendCommand(["GEOSEARCH", key, …]); return parseGeoReply(reply);',
    ],
  },
  {
    id: 'KORVET-01',
    title: 'Kirim event sensor',
    levels: [
      'Producer mengirim record Kafka ke Korvet; topic tujuan dan key diperlukan.',
      'producer.send({ topic, messages: [{ key, value }] }); key = assetId, value JSON string.',
      'await producer.send({ topic, messages: [{ key: event.…, value: JSON.stringify(…) }] });',
    ],
  },
  {
    id: 'KORVET-02',
    title: 'Terima event sensor',
    levels: [
      'Consumer subscribe satu topic, lalu run menerima record melalui eachMessage. Callback diberikan scaffold.',
      'subscribe({ topic, fromBeginning: true }); run({ eachMessage: async ({ message }) => … }). parseTelemetry membantu parsing.',
      'Subscribe → run → const event = parseTelemetry(message.value) → bila valid, await onEvent(event).',
    ],
  },
];
