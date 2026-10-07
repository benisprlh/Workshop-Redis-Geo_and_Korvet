import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const url = process.env.WEB_URL || 'http://localhost:5173';
await mkdir('test-results/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [],
  network = [],
  consoleErrors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().includes('/api/'))
    network.push(`${r.status()} ${r.url().split('/api/')[1]}`);
});
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Ringkasan', exact: true }).waitFor();
    await page.getByLabel('Cari aset').fill('A-101');
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.getByLabel('Cari aset').fill('');
    for (const [name, filename] of [
      ['Ringkasan', 'overview'],
      ['Penugasan Lapangan', 'geo'],
      ['Monitoring Aset', 'monitoring'],
    ]) {
      await page.getByRole('link', { name, exact: true }).click();
      await page.getByRole('heading', { name, exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `${name}: overflow horizontal`,
      );
      await page.screenshot({
        path: `test-results/screenshots/starter-${filename}-${viewport.width}.png`,
        fullPage: true,
      });
    }
    assert.equal(await page.getByRole('button', { name: 'Mulai simulasi' }).isDisabled(), true);
    await page.getByRole('button', { name: /Mode workshop/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Petunjuk 2' }).click();
    await page.getByText('API dan parameter', { exact: true }).waitFor();
    await page.screenshot({
      path: `test-results/screenshots/starter-workshop-${viewport.width}.png`,
      fullPage: false,
    });
    if (viewport.width === 1440) {
      for (const id of ['GEO-01', 'GEO-02', 'KORVET-01', 'KORVET-02']) {
        const row = page.getByRole('button', { name: new RegExp(id) });
        await row.click();
        assert.equal(await row.getAttribute('aria-pressed'), 'true');
        await page.getByRole('button', { name: 'Petunjuk 3' }).click();
        assert.ok((await page.locator('.hint-content pre').textContent()).length > 20);
      }
      const [guide] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByRole('link', { name: 'Baca panduan latihan' }).click(),
      ]);
      await guide.getByRole('heading', { name: 'KORVET-02', exact: true }).waitFor();
      assert.equal(await guide.locator('details').count(), 12);
      await guide.locator('summary').first().click();
      assert.equal(await guide.locator('details').first().getAttribute('open'), '');
      await guide.getByRole('link', { name: 'panduan pengelolaan', exact: true }).click();
      await guide.getByRole('heading', { name: 'Pengelolaan FieldOps', exact: true }).waitFor();
      await guide.getByRole('link', { name: 'README', exact: true }).click();
      await guide.getByRole('heading', { name: 'FieldOps', exact: true }).waitFor();
      await guide.locator('img').waitFor();
      await guide.waitForFunction(() => document.querySelector('img')?.naturalWidth > 0);
      await guide.close();
    }
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`${url}/#geo`);
  await page.getByRole('heading', { name: 'Penugasan Lapangan', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  assert.deepEqual(consoleErrors, []);
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Peta jalan', exact: true }).click();
  await page.getByText('Tile tidak tersedia. Peta skematis tetap dapat dipakai.').waitFor();
  assert.equal(await page.locator('.map-marker').count(), 17);
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/browser-review.json',
    JSON.stringify(
      {
        errors,
        network,
        consoleErrorsBeforeTileTest: [],
        tileFallback: true,
        viewports: ['1440x900', '1366x768', '768x1024'],
        starter: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'LULUS: tiga halaman starter, empat petunjuk, panduan HTML/tautan/gambar, filter aset, kontrol terkunci, keyboard drawer, tanpa pageerror/API error/overflow.',
  );
} finally {
  await browser.close();
}
