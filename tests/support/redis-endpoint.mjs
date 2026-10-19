import { createServer, connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { once } from 'node:events';

/** Redis fixture tetap asli. Relay TCP memberi backend alamat non-loopback untuk uji tahap eksternal. */
export async function remoteRedisFixture(redisUrl) {
  const target = new URL(redisUrl);
  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname))
    return { url: redisUrl, servername: hostname, close: async () => {} };
  const interfaces = Object.entries(networkInterfaces()).sort(
    ([a], [b]) => Number(!/bridge|vmenet|docker/.test(a)) - Number(!/bridge|vmenet|docker/.test(b)),
  );
  const address = interfaces
    .flatMap(([, values]) => values || [])
    .find((entry) => entry.family === 'IPv4' && !entry.internal)?.address;
  if (!address) throw new Error('Uji endpoint nonlokal memerlukan interface IPv4 non-loopback.');
  const sockets = new Set();
  const server = createServer((incoming) => {
    const upstream = connect({ host: hostname, port: Number(target.port || 6379) });
    sockets.add(incoming);
    sockets.add(upstream);
    incoming.on('error', () => upstream.destroy());
    upstream.on('error', () => incoming.destroy());
    incoming.on('close', () => {
      upstream.destroy();
      sockets.delete(incoming);
    });
    upstream.on('close', () => {
      incoming.destroy();
      sockets.delete(upstream);
    });
    incoming.pipe(upstream);
    upstream.pipe(incoming);
  });
  server.listen(0, address);
  await once(server, 'listening');
  const endpoint = new URL(redisUrl);
  endpoint.hostname = address;
  endpoint.port = String(server.address().port);
  return {
    url: endpoint.toString(),
    servername: hostname,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((done) => server.close(done));
    },
  };
}
