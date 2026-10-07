import type { Asset, Technician } from '@fieldops/contracts';

// Titik buatan di satu bidang koordinat; tidak merepresentasikan fasilitas nyata.
export const assets: Asset[] = [
  ['A-101', 110.01, -7.01, 'Area Pusat', 'Panel sensor'],
  ['A-102', 109.997, -7.014, 'Area Barat', 'Pompa'],
  ['A-103', 110.025, -7.003, 'Area Timur', 'Panel sensor'],
  ['A-104', 110.017, -7.025, 'Area Selatan', 'Motor'],
  ['A-105', 110.001, -6.989, 'Area Utara', 'Pompa'],
  ['A-106', 110.036, -7.019, 'Area Timur', 'Motor'],
  ['A-107', 109.979, -7.004, 'Area Barat', 'Panel sensor'],
].map(([id, longitude, latitude, area, type]) => ({
  id: String(id),
  name: `Aset ${id}`,
  longitude: Number(longitude),
  latitude: Number(latitude),
  area: String(area),
  type: String(type),
}));
export const technicians: Technician[] = [
  [110.006, -7.008],
  [110.013, -7.006],
  [109.996, -7.012],
  [110.025, -7.016],
  [110.009, -6.987],
  [109.981, -7.021],
  [110.04, -7.004],
  [110.012, -7.037],
  [109.977, -6.991],
  [110.043, -7.032],
].map(([longitude, latitude], i) => ({
  id: `T-${String(i + 1).padStart(2, '0')}`,
  name: `Teknisi T-${String(i + 1).padStart(2, '0')}`,
  longitude,
  latitude,
  area: i % 2 ? 'Area Pusat' : 'Area Barat',
  skills: i % 3 ? ['Sensor', 'Kelistrikan'] : ['Mekanik', 'Pompa'],
  status: i === 3 || i === 7 ? 'busy' : 'available',
  positionSource: 'preview',
}));
