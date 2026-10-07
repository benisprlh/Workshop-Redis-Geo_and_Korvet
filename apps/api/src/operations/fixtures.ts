import type { Asset, Technician, Position } from '@fieldops/contracts';

// Titik representatif wilayah Jakarta Pusat dari OpenStreetMap, diperiksa 7 Oktober 2026.
// Aset dan teknisi adalah data workshop; titik ini bukan lokasi fasilitas operasional.
// Sumber koordinat dan relation ID: docs/assets/jakarta-locations.json.
const locations: Record<string, Position> = {
  Gambir: { longitude: 106.8167439, latitude: -6.1711625 },
  Menteng: { longitude: 106.8322242, latitude: -6.1950265 },
  'Tanah Abang': { longitude: 106.8094996, latitude: -6.2052581 },
  Senen: { longitude: 106.8432354, latitude: -6.184971 },
  'Sawah Besar': { longitude: 106.8335798, latitude: -6.1558913 },
  Kemayoran: { longitude: 106.8450861, latitude: -6.1648157 },
  'Cempaka Putih': { longitude: 106.8685256, latitude: -6.1812095 },
  'Petojo Selatan': { longitude: 106.816434, latitude: -6.1750093 },
  'Petojo Utara': { longitude: 106.8153732, latitude: -6.1655438 },
  'Kebon Kelapa': { longitude: 106.8247393, latitude: -6.1642923 },
  'Pasar Baru': { longitude: 106.8334669, latitude: -6.164901 },
  'Kebon Sirih': { longitude: 106.8311054, latitude: -6.1850822 },
  'Kebon Kacang': { longitude: 106.8166009, latitude: -6.1902407 },
  Cikini: { longitude: 106.8395502, latitude: -6.1913465 },
  Kramat: { longitude: 106.845965, latitude: -6.1838194 },
  Bungur: { longitude: 106.8482316, latitude: -6.1713909 },
  'Cempaka Putih Barat': { longitude: 106.863096, latitude: -6.1797434 },
};

export const assets: Asset[] = [
  ['A-101', 'Gambir', 'Panel sensor'],
  ['A-102', 'Menteng', 'Pompa'],
  ['A-103', 'Tanah Abang', 'Panel sensor'],
  ['A-104', 'Senen', 'Motor'],
  ['A-105', 'Sawah Besar', 'Pompa'],
  ['A-106', 'Kemayoran', 'Motor'],
  ['A-107', 'Cempaka Putih', 'Panel sensor'],
].map(([id, area, type]) => ({
  id,
  name: `Aset ${id}`,
  ...locations[area],
  area,
  type,
}));

export const technicians: Technician[] = [
  'Petojo Selatan',
  'Petojo Utara',
  'Kebon Kelapa',
  'Pasar Baru',
  'Kebon Sirih',
  'Kebon Kacang',
  'Cikini',
  'Kramat',
  'Bungur',
  'Cempaka Putih Barat',
].map((area, i) => ({
  id: `T-${String(i + 1).padStart(2, '0')}`,
  name: `Teknisi T-${String(i + 1).padStart(2, '0')}`,
  ...locations[area],
  area,
  skills: i % 3 ? ['Sensor', 'Kelistrikan'] : ['Mekanik', 'Pompa'],
  status: i === 3 || i === 7 ? 'busy' : 'available',
  positionSource: 'preview',
}));
