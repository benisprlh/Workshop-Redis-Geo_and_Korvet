import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Diagram tingkat tinggi: sumber SVG lokal, hasil PNG untuk README dan preview web.
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'apps/web/public/diagrams');
const palette = {
  ink: '#26323E',
  muted: '#667582',
  border: '#AEB9C4',
  wire: '#7B8793',
  blue: '#3D6C99',
};
const escape = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const text = (
  x,
  y,
  value,
  { size = 20, weight = 400, fill = palette.ink, anchor = 'middle' } = {},
) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escape(value)}</text>`;
const node = (id, x, y, title, subtitle, { kafka = false, titleSize = 24 } = {}) => {
  const stroke = kafka ? palette.blue : palette.border;
  return `<g data-node="${id}" data-box="${x},${y},244,112"><rect x="${x}" y="${y}" width="244" height="112" rx="3" fill="white" stroke="${stroke}" stroke-width="1.5"/>${text(x + 122, y + 48, title, { size: titleSize, weight: 600 })}${text(x + 122, y + 79, subtitle, { size: 18, fill: palette.muted })}</g>`;
};
const database = (
  id,
  x,
  y,
  height,
  title,
  subtitle,
) => `<g data-node="${id}" data-box="${x},${y},244,${height}">
<path d="M${x} ${y + 14} H${x + 244} V${y + height - 14} C${x + 244} ${y + height + 5} ${x} ${y + height + 5} ${x} ${y + height - 14} Z" fill="white" stroke="${palette.border}" stroke-width="1.5"/>
<ellipse cx="${x + 122}" cy="${y + 14}" rx="122" ry="14" fill="white" stroke="${palette.border}" stroke-width="1.5"/>
${text(x + 122, y + height / 2 - 3, title, { size: 23, weight: 600 })}
${text(x + 122, y + height / 2 + 28, subtitle, { size: 18, fill: palette.muted })}</g>`;
const wire = (points, { kafka = false, both = false } = {}) => {
  const marker = kafka ? 'blue' : 'slate';
  return `<polyline points="${points.map((point) => point.join(',')).join(' ')}" fill="none" stroke="${kafka ? palette.blue : palette.wire}" stroke-width="1.8" stroke-linejoin="round"${both ? ` marker-start="url(#${marker})"` : ''} marker-end="url(#${marker})"/>`;
};
const svg = (
  height,
  title,
  body,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="${height}" viewBox="0 0 1300 ${height}" font-family="Arial, Helvetica, sans-serif">
<defs>${[
  ['blue', palette.blue],
  ['slate', palette.wire],
]
  .map(
    ([name, fill]) =>
      `<marker id="${name}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="${fill}" stroke-width="1.4" stroke-linejoin="round"/></marker>`,
  )
  .join('')}</defs>
<rect width="1300" height="${height}" fill="white"/>
${text(32, 52, title, { size: 28, weight: 600, anchor: 'start' })}${body}</svg>`;

function architecture() {
  let body = wire(
    [
      [276, 286],
      [356, 286],
    ],
    { both: true },
  );
  body += wire(
    [
      [600, 286],
      [680, 286],
    ],
    { kafka: true, both: true },
  );
  body += wire(
    [
      [924, 286],
      [1004, 286],
    ],
    { both: true },
  );
  body += wire(
    [
      [478, 230],
      [478, 140],
      [1126, 140],
      [1126, 214],
    ],
    { both: true },
  );
  body += text(802, 120, 'Lokasi teknisi', { size: 21, fill: palette.muted });
  body += text(802, 210, 'Telemetry', { size: 21, fill: palette.blue });
  body += node('web', 32, 230, 'FieldOps', 'Dashboard web');
  body += node('backend', 356, 230, 'Backend', 'API aplikasi');
  body += node('korvet', 680, 230, 'Korvet', 'Antarmuka Kafka', { kafka: true });
  body += database('redis', 1004, 214, 144, 'Redis Enterprise', 'Lokasi · telemetry');
  return svg(430, 'Arsitektur FieldOps', body);
}

function telemetry() {
  let body = wire(
    [
      [276, 220],
      [356, 220],
    ],
    { kafka: true },
  );
  body += wire(
    [
      [600, 220],
      [680, 220],
    ],
    { kafka: true, both: true },
  );
  body += wire([
    [924, 220],
    [1004, 220],
  ]);
  body += wire(
    [
      [478, 276],
      [478, 384],
    ],
    { both: true },
  );
  body += text(640, 200, 'Fetch', { size: 18, fill: palette.blue });
  body += text(964, 200, 'SSE', { size: 18, fill: palette.muted });
  body += text(502, 338, 'Tulis / baca', { size: 18, fill: palette.muted, anchor: 'start' });
  body += node('producer', 32, 164, 'Producer KafkaJS', 'Kirim event', { titleSize: 23 });
  body += node('korvet', 356, 164, 'Korvet', 'Antarmuka Kafka', { kafka: true });
  body += node('consumer', 680, 164, 'Consumer KafkaJS', 'Baca event', { titleSize: 23 });
  body += node('web', 1004, 164, 'FieldOps', 'Grafik & alarm');
  body += database('streams', 356, 384, 120, 'Redis Streams', 'Penyimpanan');
  return svg(540, 'Alur telemetry', body);
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [filename, height, source] of [
    ['workshop-architecture.png', 430, architecture()],
    ['korvet-telemetry.png', 540, telemetry()],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1300, height }, deviceScaleFactor: 2 });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style>${source}`,
    );
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.locator('[data-node]').evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const [x, y, width, height] = node.dataset.box.split(',').map(Number);
        return [...node.querySelectorAll('text')]
          .filter((text) => {
            const bounds = text.getBBox();
            return (
              bounds.x < x + 12 ||
              bounds.x + bounds.width > x + width - 12 ||
              bounds.y + bounds.height > y + height - 10
            );
          })
          .map((text) => `${node.dataset.node}: ${text.textContent}`);
      }),
    );
    if (overflow.length) throw new Error(`Label keluar komponen: ${overflow.join('; ')}`);
    await page.locator('svg').screenshot({ path: resolve(output, filename) });
    await page.close();
    console.log(`${filename}: 2600 × ${height * 2} px`);
  }
} finally {
  await browser.close();
}
