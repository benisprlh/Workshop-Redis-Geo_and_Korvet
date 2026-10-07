import {
  type LabRedis,
  type Coordinates,
  type GeoHit,
  parseGeoReply,
  WorkshopTodoError,
} from '../workshop/support.js';

/** GEO-01: Redis mengupdate member yang sama tanpa menduplikasi teknisi. */
export async function saveTechnicianPosition(
  redis: LabRedis,
  key: string,
  technicianId: string,
  position: Coordinates,
): Promise<void> {
  await redis.geoAdd(key, {
    longitude: position.longitude,
    latitude: position.latitude,
    member: technicianId,
  });
}

/** GEO-02: Redis menghitung jarak geografis; ASC mengurutkan dari yang terdekat. */
export async function findNearbyTechnicians(
  redis: LabRedis,
  key: string,
  center: Coordinates,
  radiusKm: number,
): Promise<GeoHit[]> {
  // Opsi dikelompokkan sesuai urutan command Redis agar mudah diikuti peserta.
  // prettier-ignore
  const reply = await redis.sendCommand([
    'GEOSEARCH', key,
    'FROMLONLAT', String(center.longitude), String(center.latitude),
    'BYRADIUS', String(radiusKm), 'km',
    'ASC', 'WITHDIST', 'WITHCOORD',
  ]);
  return parseGeoReply(reply);
}
