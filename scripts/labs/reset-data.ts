import { config } from '../../apps/api/src/infrastructure/config.js';
import { resetLabData } from '../../apps/api/src/operations/reset-data.js';
const args = process.argv.slice(2);
if (!args.includes(`--confirm=${config.labId}`))
  throw new Error(
    `Reset hanya namespace lab: tambahkan --confirm=${config.labId}. Kode tidak direset.`,
  );
if (args.includes('--direct')) {
  // Hanya gunakan saat backend utama sudah dihentikan agar consumer tidak memakai topic lama.
  await resetLabData(config.labId);
} else {
  const response = await fetch(`${process.env.API_URL || 'http://localhost:3001'}/api/data/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: config.labId }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error((await response.json()).error);
}
console.log(`Data ${config.labId} direset. Kode latihan tetap sama.`);
