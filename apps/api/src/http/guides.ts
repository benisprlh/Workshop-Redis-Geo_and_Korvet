import type { Express } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { marked, Renderer } from 'marked';

const documents: Record<string, string> = {
  'README.md': 'README.md',
  'workshop.md': 'docs/workshop.md',
  'operations.md': 'docs/operations.md',
  'references.md': 'docs/references.md',
};
const assets = new Set([
  'overview.png',
  'assignment.png',
  'monitoring.png',
  'workshop.png',
  'assignment-solution.png',
  'monitoring-solution.png',
]);
const projectRoot = () =>
  process.cwd().endsWith('/apps/api') ? resolve(process.cwd(), '../..') : process.cwd();
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
  if (Object.hasOwn(documents, file))
    return `<a href="/api/docs/${file}${anchor ? `#${escape(anchor)}` : ''}">${label}</a>`;
  if (path === 'licenses/korvet-LICENSE.txt')
    return `<a href="/api/docs/licenses/korvet-LICENSE.txt">${label}</a>`;
  if (assets.has(file)) return `<a href="/api/docs/assets/${file}">${label}</a>`;
  // Referensi source tetap dibaca dari checkout, bukan dipublikasikan lewat endpoint panduan.
  return label;
};
renderer.image = ({ href, text }) => {
  const file = href.split('/').at(-1)!;
  return assets.has(file)
    ? `<img src="/api/docs/assets/${file}" alt="${escape(text)}">`
    : escape(text);
};

export function registerGuides(app: Express): void {
  app.get('/api/docs/theme.css', (_req, res) => {
    res.type('css').sendFile(resolve(projectRoot(), 'docs/theme.css'));
  });
  app.get('/api/docs/assets/:file', (req, res) => {
    if (!assets.has(req.params.file)) {
      res.status(404).json({ error: 'Gambar tidak ditemukan.' });
      return;
    }
    res.sendFile(resolve(projectRoot(), 'docs/assets', req.params.file));
  });
  app.get('/api/docs/licenses/korvet-LICENSE.txt', (_req, res) => {
    res.type('text').sendFile(resolve(projectRoot(), 'docs/licenses/korvet-LICENSE.txt'));
  });
  app.get('/api/docs/:file', async (req, res, next) => {
    if (!Object.hasOwn(documents, req.params.file)) {
      res.status(404).json({ error: 'Panduan tidak ditemukan.' });
      return;
    }
    try {
      const source = await readFile(resolve(projectRoot(), documents[req.params.file]), 'utf8');
      const content = await marked(source, { renderer });
      res
        .type('html')
        .send(
          `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FieldOps · Panduan workshop</title><link rel="stylesheet" href="/api/docs/theme.css"></head><body><header><div><strong>FieldOps</strong><a href="/#overview">Kembali ke konsol</a></div></header><main>${content}</main></body></html>`,
        );
    } catch (error) {
      next(error);
    }
  });
}
