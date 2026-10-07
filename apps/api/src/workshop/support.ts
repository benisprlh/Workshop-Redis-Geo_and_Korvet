import { z } from 'zod';
import type { createClient } from 'redis';
import type { Position, TelemetryEvent } from '@fieldops/contracts';

export type LabRedis = ReturnType<typeof createClient>;
export type Coordinates = Position;
export type { TelemetryEvent };
export interface GeoHit extends Coordinates {
  technicianId: string;
  distanceKm: number;
}
export type TelemetryHandler = (event: TelemetryEvent) => Promise<void>;

export class WorkshopTodoError extends Error {
  constructor(public readonly exerciseId: string) {
    super(`Isi latihan ${exerciseId}, lalu klik Periksa latihan.`);
    this.name = 'WorkshopTodoError';
  }
}

// Latitude Redis GEO dibatasi oleh proyeksi Mercator. Urutan command: longitude, latitude.
export const coordinatesSchema = z.object({
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-85.05112878).max(85.05112878),
});
export const telemetrySchema = z
  .object({
    eventId: z.string().uuid(),
    assetId: z.string().regex(/^A-\d{3}$/),
    timestamp: z.string().datetime(),
    temperatureC: z.number().finite().min(-50).max(250),
    voltageV: z.number().finite().min(0).max(500),
    currentA: z.number().finite().min(0).max(200),
  })
  .strict();

// Hanya parsing jawaban Redis; helper ini tidak mencari atau menghitung jarak.
export function parseGeoReply(reply: unknown): GeoHit[] {
  if (!Array.isArray(reply)) throw new Error('Jawaban GEOSEARCH harus berupa array.');
  return reply.map((row: unknown) => {
    if (!Array.isArray(row) || !Array.isArray(row[2]))
      throw new Error('Gunakan WITHDIST dan WITHCOORD.');
    const hit = {
      technicianId: String(row[0]),
      distanceKm: Number(row[1]),
      longitude: Number(row[2][0]),
      latitude: Number(row[2][1]),
    };
    if (![hit.distanceKm, hit.longitude, hit.latitude].every(Number.isFinite))
      throw new Error('Format jarak/koordinat GEOSEARCH tidak benar.');
    return hit;
  });
}

// Payload buruk diabaikan tanpa menghentikan loop consumer. Simulator/API divalidasi sebelum produce.
export function parseTelemetry(value: Buffer | null): TelemetryEvent | undefined {
  if (!value) return undefined;
  try {
    const result = telemetrySchema.safeParse(JSON.parse(value.toString('utf8')));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
