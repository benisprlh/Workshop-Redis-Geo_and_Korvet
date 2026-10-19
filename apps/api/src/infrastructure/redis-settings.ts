import { readFileSync } from 'node:fs';
import type { RedisClientOptions } from 'redis';
import type { RedisConnection } from '@fieldops/contracts';
import { isLocalRedisHost } from './redis-endpoint.js';

/** Konfigurasi backend saja. Jangan serialisasikan options atau URI ke browser. */
export function readRedisSettings(environment: NodeJS.ProcessEnv) {
  const url = environment.REDIS_URL?.trim() || '';
  const caFile = environment.REDIS_CA_FILE || '';
  const certFile = environment.REDIS_CLIENT_CERT_FILE || '';
  const keyFile = environment.REDIS_CLIENT_KEY_FILE || '';
  const connectTimeout = Number(environment.REDIS_CONNECT_TIMEOUT_MS || 5000);
  const endpoint: RedisConnection['endpoint'] = {
    host: '',
    local: false,
    port: 6379,
    database: 0,
    tls: false,
    credentialsConfigured: false,
  };
  let issue: string | undefined;
  let options: RedisClientOptions | undefined;
  try {
    const address = new URL(url);
    if (
      !['redis:', 'rediss:'].includes(address.protocol) ||
      !address.hostname ||
      address.search ||
      address.hash
    )
      throw new Error();
    const database = address.pathname.replace(/^\//, '') || '0';
    if (!/^\d+$/.test(database) || !Number.isSafeInteger(Number(database))) throw new Error();
    const port = Number(address.port || 6379);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
    decodeURIComponent(address.username);
    decodeURIComponent(address.password);
    Object.assign(endpoint, {
      host: address.hostname,
      local: isLocalRedisHost(address.hostname),
      port,
      database: Number(database),
      tls: address.protocol === 'rediss:',
      credentialsConfigured: Boolean(address.username || address.password),
    });
    options = { url };
  } catch {
    issue = url
      ? 'REDIS_URL tidak valid. Gunakan redis:// atau rediss:// dengan hostname dan port database. Encode karakter khusus pada username/password.'
      : 'REDIS_URL belum diisi. Isi endpoint database Redis di .env, simpan, lalu tekan Periksa koneksi Redis.';
  }
  if (
    !issue &&
    (!Number.isInteger(connectTimeout) || connectTimeout < 500 || connectTimeout > 15000)
  )
    issue = 'REDIS_CONNECT_TIMEOUT_MS harus berupa angka 500–15000 milidetik.';
  if (!issue && Boolean(certFile) !== Boolean(keyFile))
    issue = 'Isi REDIS_CLIENT_CERT_FILE dan REDIS_CLIENT_KEY_FILE berpasangan untuk mutual TLS.';
  if (!issue && !endpoint.tls && (caFile || certFile || keyFile))
    issue = 'Sertifikat TLS memerlukan REDIS_URL dengan skema rediss://.';
  if (!issue && endpoint.tls && options) {
    try {
      options.socket = {
        tls: true,
        rejectUnauthorized: true,
        ...(environment.REDIS_TLS_SERVERNAME
          ? { servername: environment.REDIS_TLS_SERVERNAME }
          : {}),
        ...(caFile ? { ca: [readFileSync(caFile)] } : {}),
        ...(certFile ? { cert: readFileSync(certFile), key: readFileSync(keyFile) } : {}),
      };
    } catch {
      issue =
        'File CA atau sertifikat client tidak dapat dibaca backend. Periksa path dan mount folder sertifikat.';
    }
  }
  return {
    url,
    endpoint,
    options,
    issue,
    connectTimeout: Number.isFinite(connectTimeout) ? connectTimeout : 5000,
  };
}
