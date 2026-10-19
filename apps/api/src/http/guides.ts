import type { Express } from 'express';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { marked, Renderer } from 'marked';

const assets: Record<string, string> = {
  'theme.css': 'apps/api/src/http/guide.css',
  'copy.js': 'apps/api/src/http/guide-copy.js',
  'workshop.png': 'apps/web/public/workshop.png',
  'workshop-architecture.png': 'apps/web/public/diagrams/workshop-architecture.png',
  'korvet-telemetry.png': 'apps/web/public/diagrams/korvet-telemetry.png',
  'jakarta-locations.json': 'apps/api/src/operations/jakarta-locations.json',
  'korvet-LICENSE.txt': 'licenses/korvet-LICENSE.txt',
};
const projectRoot = () => {
  // Panduan mengikuti checkout yang sama dengan .env; edit README/gambar cukup dimuat ulang.
  const environmentFile = process.env.WORKSHOP_ENV_FILE;
  if (environmentFile) {
    const workspace = dirname(resolve(environmentFile));
    if (
      existsSync(resolve(workspace, 'README.md')) &&
      existsSync(resolve(workspace, 'apps/api/src/http/guide.css'))
    )
      return workspace;
  }
  return process.cwd().endsWith('/apps/api') ? resolve(process.cwd(), '../..') : process.cwd();
};
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const renderer = new Renderer();
renderer.heading = ({ depth, text, tokens }) => {
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `<h${depth} id="${id}">${renderer.parser.parseInline(tokens)}</h${depth}>`;
};
renderer.html = ({ text }) =>
  text
    .split(/(<[^>]+>)/g)
    .map((part) => (/^<\/?(?:details|summary)(?:\s+open)?\s*>$/i.test(part) ? part : escape(part)))
    .join('');
renderer.link = ({ href, tokens }) => {
  const label = renderer.parser.parseInline(tokens);
  if (href.startsWith('https://') || href.startsWith('http://') || href.startsWith('#'))
    return `<a href="${escape(href)}">${label}</a>`;
  const [path, anchor] = href.split('#');
  const file = path.split('/').at(-1)!;
  if (file === 'README.md')
    return `<a href="/api/guide${anchor ? `#${escape(anchor)}` : ''}">${label}</a>`;
  if (Object.hasOwn(assets, file)) return `<a href="/api/guide/${file}">${label}</a>`;
  // Referensi source tetap dibaca dari checkout, bukan dipublikasikan lewat endpoint panduan.
  return label;
};
renderer.image = ({ href, text }) => {
  const file = href.split('/').at(-1)!;
  return Object.hasOwn(assets, file)
    ? `<img src="/api/guide/${file}" alt="${escape(text)}">`
    : escape(text);
};

export function registerGuides(app: Express): void {
  app.get('/api/guide/:asset', (req, res) => {
    if (!Object.hasOwn(assets, req.params.asset)) {
      res.status(404).json({ error: 'Lampiran tidak ditemukan.' });
      return;
    }
    res.set('Cache-Control', 'no-cache');
    res.sendFile(resolve(projectRoot(), assets[req.params.asset]));
  });
  // Tautan lama diarahkan ke satu sumber panduan yang dipelihara.
  app.get('/api/docs/:file', (req, res) => {
    if (['README.md', 'workshop.md', 'operations.md', 'references.md'].includes(req.params.file))
      res.redirect(302, '/api/guide');
    else res.status(404).json({ error: 'Panduan tidak ditemukan.' });
  });
  app.get('/api/guide', async (_req, res, next) => {
    try {
      const source = await readFile(resolve(projectRoot(), 'README.md'), 'utf8');
      const content = await marked(source, { renderer });
      res
        .set('Cache-Control', 'no-cache')
        .type('html')
        .send(
          `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FieldOps · Panduan workshop</title><link rel="stylesheet" href="/api/guide/theme.css"><script defer src="/api/guide/copy.js"></script></head><body><header><div><strong>FieldOps</strong><a href="/#overview">Kembali ke konsol</a></div></header><main>${content}</main></body></html>`,
        );
    } catch (error) {
      next(error);
    }
  });
}
