import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** Kendali internal lab. Tidak dipublikasikan ke host atau diproksikan ke browser. */
export async function manageKorvet(directory, apply, disconnect) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = (name) => join(directory, name);
  const read = (name) => readFile(file(name), 'utf8').catch(() => '');
  async function save(name, value) {
    await writeFile(file(name + '.new'), value, { mode: 0o600 });
    await rename(file(name + '.new'), file(name));
  }
  async function stopped(revision) {
    const end = Date.now() + 18000;
    while (Date.now() < end) {
      if ((await read('stopped')) === revision) return;
      await pause(100);
    }
    throw new Error('Korvet belum berhenti untuk pergantian endpoint.');
  }
  let current;
  let busy = false;
  try {
    const saved = JSON.parse(await read('configuration.json'));
    apply(saved.settings); // Pemulihan transport setelah service penghubung dimulai ulang.
    if ((await read('active')) === saved.revision) current = saved;
  } catch {
    /* Konfigurasi pertama berasal dari pemeriksaan UI. */
  }

  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    const send = (status, value) => {
      response.writeHead(status);
      response.end(JSON.stringify(value));
    };
    if (request.method === 'GET' && request.url === '/health') return send(200, { ready: true });
    if (request.method !== 'POST' || request.url !== '/configuration')
      return send(404, { error: 'Tidak ditemukan.' });
    if (busy) return send(409, { error: 'Pergantian koneksi masih berjalan.' });
    busy = true;
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 262144) throw new Error();
      }
      const settings = JSON.parse(body);
      const target = new URL(settings.url);
      if (
        !['redis:', 'rediss:'].includes(target.protocol) ||
        !target.hostname ||
        target.search ||
        target.hash ||
        !/^\/?\d*$/.test(target.pathname) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(settings.namespace)
      )
        throw new Error();
      const revision = createHash('sha256').update(JSON.stringify(settings)).digest('hex');
      if (
        current?.revision !== revision ||
        (await read('active')) !== revision ||
        (await read('desired')) !== revision
      ) {
        // Hentikan proses lama sebelum transport, AUTH, database, dan namespace berganti.
        await save('desired', revision);
        await stopped(revision);
        disconnect();
        apply(settings);
        const local = new URL(target);
        local.protocol = 'redis:';
        local.hostname = 'redis-link';
        local.port = '16379';
        await save('redis-uri', local.toString());
        await save('namespace', settings.namespace);
        await save('configuration.json', JSON.stringify({ revision, settings }));
        await save('active', revision); // Commit terakhir; supervisor baru boleh membuka broker.
        current = { revision, settings };
      }
      send(200, { revision });
    } catch {
      send(503, {
        error: 'Penerapan penyimpanan Korvet gagal. Periksa layanan Korvet dan penghubung Redis.',
      });
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 25000;
  server.listen(Number(process.env.KORVET_CONTROL_PORT || 16400), '0.0.0.0');
  return server;
}
