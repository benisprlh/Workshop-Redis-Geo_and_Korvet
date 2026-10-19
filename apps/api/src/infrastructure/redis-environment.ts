import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { readRedisSettings } from './redis-settings.js';

let fileWasPresent = false;
const defaultFile = () =>
  resolve(process.cwd(), process.cwd().endsWith('/apps/api') ? '../../.env' : '.env');

/** Baca ulang hanya konfigurasi Redis; LAB_ID/topic/group tetap milik instance yang berjalan. */
export function readRedisEnvironment() {
  const file = process.env.WORKSHOP_ENV_FILE || defaultFile();
  try {
    const values = parse(readFileSync(file));
    fileWasPresent = true;
    return readRedisSettings({
      ...process.env,
      // File yang tersedia menjadi sumber koneksi. Nilai yang dihapus tidak memakai env lama.
      REDIS_URL: values.REDIS_URL || '',
      REDIS_CONNECT_TIMEOUT_MS: values.REDIS_CONNECT_TIMEOUT_MS || '5000',
    });
  } catch (error) {
    // Endpoint instruktur juga bisa disediakan langsung sebagai environment tanpa file.
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' &&
      !process.env.WORKSHOP_ENV_FILE &&
      !fileWasPresent
    )
      return readRedisSettings(process.env);
    const settings = readRedisSettings({});
    settings.issue =
      'File .env tidak dapat dibaca backend. Simpan file konfigurasi lab, lalu tekan Periksa koneksi Redis kembali.';
    return settings;
  }
}
