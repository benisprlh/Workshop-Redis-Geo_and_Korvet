import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const loopback = new BlockList();
loopback.addSubnet('127.0.0.0', 8, 'ipv4');
loopback.addAddress('0.0.0.0', 'ipv4');
loopback.addAddress('::1', 'ipv6');
loopback.addAddress('::', 'ipv6');
loopback.addSubnet('::ffff:127.0.0.0', 104, 'ipv6');
loopback.addAddress('::ffff:0.0.0.0', 'ipv6');
const localNames = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'redis',
  'redis.local',
  'redis-link',
  'host.docker.internal',
  'gateway.docker.internal',
  'host.lima.internal',
]);
const normalize = (host: string) =>
  host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

/** Kebijakan workshop: placeholder lokal tidak menyelesaikan persiapan koneksi. */
export function isLocalRedisHost(host: string): boolean {
  const value = normalize(host);
  const family = isIP(value);
  return (
    localNames.has(value) ||
    value.endsWith('.localhost') ||
    (family !== 0 && loopback.check(value, family === 4 ? 'ipv4' : 'ipv6'))
  );
}

export async function isLocalRedisEndpoint(host: string): Promise<boolean> {
  if (isLocalRedisHost(host)) return true;
  // Alias DNS menuju loopback tetap koneksi lokal. IP privat Enterprise tetap diperbolehkan.
  const addresses = await lookup(normalize(host), { all: true });
  if (addresses.some(({ address }) => isLocalRedisHost(address))) return true;
  // Bandingkan alamat service bawaan agar mengganti 'redis' ke IP/alias container tidak membuka lab.
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const local = await Promise.race([
      lookup('redis', { all: true }).catch(() => []),
      new Promise<{ address: string }[]>((done) => {
        deadline = setTimeout(() => done([]), 350);
      }),
    ]);
    return addresses.some(({ address }) => local.some((entry) => entry.address === address));
  } finally {
    clearTimeout(deadline);
  }
}

export const localRedisMessage =
  'Redis lokal adalah koneksi awal. Latihan tetap terkunci. Ganti REDIS_URL di .env ke endpoint Redis lain dari instruktur, terapkan ulang backend, lalu periksa koneksi.';
