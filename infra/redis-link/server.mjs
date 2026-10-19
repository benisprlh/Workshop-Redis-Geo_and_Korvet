import net from 'node:net';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import { manageKorvet } from './runtime.mjs';

// Penghubung transport saja: byte Redis diteruskan tanpa parsing atau operasi database.
let target, socketOptions;
function configure(settings) {
  const nextTarget = new URL(settings.url);
  if (
    !['redis:', 'rediss:'].includes(nextTarget.protocol) ||
    !nextTarget.hostname ||
    nextTarget.search ||
    nextTarget.hash
  )
    throw new Error();
  const { ca, cert, key, servername } = settings;
  if (Boolean(cert) !== Boolean(key)) throw new Error();
  const nextOptions = {
    host: nextTarget.hostname.replace(/^\[|\]$/g, ''),
    port: Number(nextTarget.port || 6379),
    ...(nextTarget.protocol === 'rediss:'
      ? {
          servername: servername || nextTarget.hostname,
          rejectUnauthorized: true,
          ...(ca ? { ca: [ca] } : {}),
          ...(cert ? { cert, key } : {}),
        }
      : {}),
  };
  target = nextTarget;
  socketOptions = nextOptions;
}
const sockets = new Set();
const disconnect = () => {
  for (const socket of sockets) socket.destroy();
};
let control;
if (process.env.KORVET_RUNTIME_DIRECTORY) {
  control = await manageKorvet(process.env.KORVET_RUNTIME_DIRECTORY, configure, disconnect);
} else {
  try {
    const pem = (path) => (path ? readFileSync(path, 'utf8') : undefined);
    configure({
      url: process.env.REDIS_URL,
      ca: pem(process.env.REDIS_CA_FILE),
      cert: pem(process.env.REDIS_CLIENT_CERT_FILE),
      key: pem(process.env.REDIS_CLIENT_KEY_FILE),
      servername: process.env.REDIS_TLS_SERVERNAME,
    });
  } catch {
    console.error('Penghubung Redis: periksa REDIS_URL dan konfigurasi backend.');
    process.exit(1);
  }
}
const server = net.createServer((incoming) => {
  if (!target) {
    incoming.destroy();
    return;
  }
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
  disconnect();
  control?.close();
  server.close(() => process.exit(0));
});
