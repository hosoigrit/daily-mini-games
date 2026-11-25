import { expect, test } from '@playwright/test';

const folder = '/daily-mini-games/games/0011_rhythm-factory/';
const modes = [{ name: 'dev', port: 4173 }, { name: 'dist', port: 4174 }] as const;

for (const { name, port } of modes) {
  test(`POC-16 / ${name}: starts under the subpath, paints and loads scoped assets`, async ({ page, browser }, testInfo) => {
    const appUrl = `http://127.0.0.1:${port}${folder}`;
    const errors: string[] = [];
    const assets: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(`${request.url()} ${request.failure()?.errorText}`));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      const resourceType = response.request().resourceType();
      if (resourceType === 'script' || resourceType === 'stylesheet') assets.push(response.url());
    });

    const response = await page.goto(appUrl);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'リズムファクトリー' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('テスト状態 READY');
    await expect.poll(async () => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const pixel = canvas.getContext('2d')?.getImageData(15, 34, 1, 1).data;
      return pixel ? Array.from(pixel) : [];
    })).toEqual([29, 105, 87, 255]);

    const toggle = page.getByRole('button', { name: 'テスト状態を切り替える' });
    await toggle.click();
    await expect(page.getByRole('status')).toHaveText('テスト状態 INITIALIZING');
    await toggle.click();
    await expect(page.getByRole('status')).toHaveText('テスト状態 READY');

    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every((url) => url.startsWith(appUrl))).toBe(true);
    if (name === 'dist') {
      expect(assets.some((url) => /\/assets\/.*\.js$/.test(url))).toBe(true);
      expect(assets.some((url) => /\/assets\/.*\.css$/.test(url))).toBe(true);
      expect((await page.request.get(`http://127.0.0.1:${port}/`)).status()).toBe(404);
      expect((await page.request.get(appUrl + 'missing.js')).status()).toBe(404);
    }
    expect(errors).toEqual([]);
    testInfo.annotations.push({ type: 'browser version', description: browser.version() });
  });
}
