import { randomUUID } from 'node:crypto';
import type { RedisConnection } from '@fieldops/contracts';
import { makeRedis } from '../infrastructure/clients.js';
import { config } from '../infrastructure/config.js';
import { timeout } from '../shared/errors.js';
import { isLocalRedisEndpoint, localRedisMessage } from '../infrastructure/redis-endpoint.js';

export function initialRedisConnection(): RedisConnection {
  return {
    status: !config.redis.issue && config.redis.endpoint.local ? 'local' : 'unchecked',
    endpoint: { ...config.redis.endpoint },
    message:
      config.redis.issue ||
      (config.redis.endpoint.local
        ? localRedisMessage
        : 'Endpoint telah diisi. Koneksi belum dibuka; tekan Periksa koneksi Redis untuk melanjutkan.'),
    checks: { ping: false, writeRead: false, cleanup: false },
  };
}

function failureMessage(error: unknown, phase: string): string {
  const message = error instanceof Error ? error.message : '';
  const code = (error as NodeJS.ErrnoException | undefined)?.code || '';
  if (/WRONGPASS|NOAUTH|invalid username-password/i.test(message))
    return 'Autentikasi ditolak. Periksa username/password database di REDIS_URL dan encode karakter khusus.';
  if (/NOPERM|permission|not allowed/i.test(message))
    return 'Izin ACL belum cukup. Akun perlu PING, SET, GET, dan DEL pada fieldops:<LAB_ID>:check:*.';
  if (/CERT|TLS|SSL|certificate|self.signed/i.test(code + message))
    return 'TLS gagal. Gunakan rediss://, CA yang benar, hostname sesuai sertifikat, dan cert/key client jika mutual TLS diwajibkan.';
  if (/ENOTFOUND|EAI_AGAIN/.test(code))
    return 'Hostname Redis tidak ditemukan. Periksa endpoint database dan akses DNS/VPN dari backend.';
  if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|socket|timeout|waktu/i.test(code + message))
    return 'Redis tidak dapat dijangkau. Periksa hostname, port database, jaringan/VPN, dan firewall dari backend.';
  return `Pemeriksaan ${phase} gagal. Periksa endpoint, kredensial, TLS, dan izin akses database.`;
}

/** Persiapan koneksi; fixture ini tidak menyiapkan index bisnis atau menggantikan fungsi labs. */
export async function checkRedisConnection(): Promise<RedisConnection> {
  const result = initialRedisConnection();
  result.status = 'failed';
  result.checkedAt = new Date().toISOString();
  if (config.redis.issue) {
    result.message = config.redis.issue;
    return result;
  }
  const redis = makeRedis();
  const key = `fieldops:${config.labId}:check:${randomUUID()}:connection`;
  let phase = 'koneksi';
  try {
    await timeout(
      (async () => {
        await redis.connect();
        phase = 'PING';
        if ((await redis.ping()) !== 'PONG') throw new Error('PING tidak sesuai.');
        result.checks.ping = true;
        phase = 'baca/tulis';
        for (const value of [randomUUID(), randomUUID()]) {
          await redis.set(key, value, { EX: 30 });
          if ((await redis.get(key)) !== value) throw new Error('Nilai baca tidak sesuai.');
        }
        result.checks.writeRead = true;
        phase = 'cleanup';
        await redis.del(key);
        if ((await redis.get(key)) !== null) throw new Error('Cleanup tidak sesuai.');
        result.checks.cleanup = true;
      })(),
      config.redis.connectTimeout + 6000,
    );
    phase = 'endpoint nonlokal';
    result.endpoint.local = await timeout(isLocalRedisEndpoint(result.endpoint.host), 2000);
    result.status = result.endpoint.local ? 'local' : 'passed';
    result.message = result.endpoint.local
      ? `Redis lokal tersambung; PING, baca/tulis, dan cleanup berhasil. ${localRedisMessage}`
      : 'Koneksi terverifikasi. Endpoint nonlokal, PING, dua nilai baca/tulis, dan cleanup fixture berhasil. Lanjutkan GEO-01.';
  } catch (error) {
    result.message = failureMessage(error, phase);
  } finally {
    if (redis.isReady && !result.checks.cleanup)
      await timeout(redis.del(key), 1500).catch(() => {});
    if (redis.isOpen) await redis.disconnect().catch(() => {});
  }
  return result;
}
