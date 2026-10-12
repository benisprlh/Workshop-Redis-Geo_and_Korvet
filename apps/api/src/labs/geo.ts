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
  // Isi sekitar 3–5 baris: GEOADD key, longitude, latitude, technicianId.
  throw new WorkshopTodoError('GEO-01');
}

/** GEO-02: Redis menghitung jarak geografis; ASC mengurutkan dari yang terdekat. */
export async function findNearbyTechnicians(
  redis: LabRedis,
  key: string,
  center: Coordinates,
  radiusKm: number,
): Promise<GeoHit[]> {
  // Isi sekitar 5–10 baris: GEOSEARCH FROMLONLAT, BYRADIUS km, ASC, WITHDIST, WITHCOORD.
  // parseGeoReply(reply) sudah disediakan untuk mengubah jawaban Redis menjadi GeoHit[].
  throw new WorkshopTodoError('GEO-02');
}
