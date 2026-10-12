import net from 'node:net';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';

// Penghubung transport saja: byte Redis diteruskan tanpa parsing atau operasi database.
let target, socketOptions;
try {
  target = new URL(process.env.REDIS_URL);
  if (
    !['redis:', 'rediss:'].includes(target.protocol) ||
    !target.hostname ||
    target.search ||
    target.hash
  )
    throw new Error();
  const ca = process.env.REDIS_CA_FILE;
  const cert = process.env.REDIS_CLIENT_CERT_FILE;
  const key = process.env.REDIS_CLIENT_KEY_FILE;
  if (Boolean(cert) !== Boolean(key)) throw new Error();
  socketOptions = {
    host: target.hostname,
    port: Number(target.port || 6379),
    ...(target.protocol === 'rediss:'
      ? {
          servername: process.env.REDIS_TLS_SERVERNAME || target.hostname,
          rejectUnauthorized: true,
          ...(ca ? { ca: [readFileSync(ca)] } : {}),
          ...(cert ? { cert: readFileSync(cert), key: readFileSync(key) } : {}),
        }
      : {}),
  };
} catch {
  console.error('Penghubung Redis: periksa REDIS_URL dan file sertifikat pada backend.');
  process.exit(1);
}
const sockets = new Set();
const server = net.createServer((incoming) => {
  incoming.pause();
  const encrypted = target.protocol === 'rediss:';
  let upstream;
  try {
    upstream = encrypted ? tls.connect(socketOptions) : net.connect(socketOptions);
  } catch {
    incoming.destroy();
    return;
  }
  sockets.add(incoming);
  sockets.add(upstream);
  const deadline = setTimeout(() => {
    incoming.destroy();
    upstream.destroy();
  }, 15000);
  upstream.once(encrypted ? 'secureConnect' : 'connect', () => {
    clearTimeout(deadline);
    incoming.pipe(upstream);
    upstream.pipe(incoming);
    incoming.resume();
  });
  // Error mentah dapat memuat endpoint; cukup status generik tanpa URI/kredensial.
  upstream.on('error', () => incoming.destroy());
  incoming.on('error', () => upstream.destroy());
  incoming.once('close', () => {
    clearTimeout(deadline);
    upstream.destroy();
    sockets.delete(incoming);
  });
  upstream.once('close', () => {
    clearTimeout(deadline);
    incoming.destroy();
    sockets.delete(upstream);
  });
});
server.listen(Number(process.env.REDIS_LINK_PORT || 16379), '0.0.0.0', () =>
  console.log('Penghubung Redis siap pada jaringan internal lab.'),
);
process.once('SIGTERM', () => {
  for (const socket of sockets) socket.destroy();
  server.close(() => process.exit(0));
});
