import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { readRedisSettings } from './redis-settings.js';

let fileWasPresent = false;
const defaultFile = () =>
  resolve(process.cwd(), process.cwd().endsWith('/apps/api') ? '../../.env' : '.env');

/** LAB_ID/topic/group tetap milik instance; koneksi dibaca dari satu snapshot file. */
export function readWorkshopEnvironment(): { values: NodeJS.ProcessEnv; issue?: string } {
  const file = process.env.WORKSHOP_ENV_FILE || defaultFile();
  try {
    const values = parse(readFileSync(file));
    fileWasPresent = true;
    return {
      values: {
        ...process.env,
        ...values,
        ...(Object.hasOwn(values, 'KAFKA_BROKERS')
          ? {
              KAFKA_SSL: values.KAFKA_SSL || 'false',
              KAFKA_USERNAME: values.KAFKA_USERNAME || '',
              KAFKA_PASSWORD: values.KAFKA_PASSWORD || '',
              KORVET_NAMESPACE: values.KORVET_NAMESPACE || 'korvet',
            }
          : {}),
        // File yang tersedia menjadi sumber koneksi. Nilai yang dihapus tidak memakai env lama.
        REDIS_URL: values.REDIS_URL || '',
        REDIS_CONNECT_TIMEOUT_MS: values.REDIS_CONNECT_TIMEOUT_MS || '5000',
      },
    };
  } catch (error) {
    // Endpoint instruktur juga bisa disediakan langsung sebagai environment tanpa file.
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' &&
      !process.env.WORKSHOP_ENV_FILE &&
      !fileWasPresent
    )
      return { values: process.env };
    return {
      values: {},
      issue:
        'File .env tidak dapat dibaca backend. Simpan file konfigurasi lab, lalu tekan Periksa koneksi Redis kembali.',
    };
  }
}

export function readRedisEnvironment(environment = readWorkshopEnvironment()) {
  const settings = readRedisSettings(environment.values);
  if (environment.issue) settings.issue = environment.issue;
  return settings;
}
