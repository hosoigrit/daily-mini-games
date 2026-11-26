import { expect, test, type Page } from '@playwright/test';

const qaPath = '/qa/device-audio-clock/';

async function openQa(page: Page) {
  const response = await page.goto(qaPath);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('#harness-version')).not.toHaveText('—');
}

test('serves the isolated QA endpoint in a managed browser at desktop or touch viewport', async (
  { page, browser, browserName, isMobile }, info,
) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await openQa(page);

  await expect(page).toHaveTitle(/実機QA/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('リズムファクトリー');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.locator('header')).toContainText('HOLD');
  await expect(page.locator('#product-commit')).toHaveText(/^[\da-f]{40}$/);
  await expect(page.locator('#baseline-commit')).toHaveText(/^[\da-f]{40}$/);
  expect(requests.filter((request) => new URL(request).origin !== new URL(page.url()).origin)).toEqual([]);

  const browserObservation = await page.evaluate(() => ({
    hasAudioContext: typeof AudioContext === 'function',
    hasOfflineAudioContext: typeof OfflineAudioContext === 'function',
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
  }));
  expect(browserObservation.hasAudioContext).toBe(true);
  expect(browserObservation.hasOfflineAudioContext).toBe(true);
  await info.attach('qa-browser-visit', {
    contentType: 'application/json',
    body: JSON.stringify({
      browserName,
      version: browser.version(),
      profile: info.project.name,
      mobileEmulation: isMobile,
      physicalDeviceVerified: false,
      ...browserObservation,
    }),
  });
});

test('keeps all eight UI case routes aligned to their fixture and visible at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openQa(page);

  const cases = [
    ['DEV-AUD-01', 'rotation-24'],
    ['DEV-AUD-02', 'rotation-24'],
    ['DEV-AUD-03', 'rotation-24'],
    ['DEV-AUD-04', 'load-84'],
    ['DEV-AUD-05', 'rotation-24'],
    ['DEV-AUD-06', 'rotation-24'],
    ['DEV-AUD-07', 'rotation-24'],
    ['DEV-AUD-08', 'load-84'],
  ] as const;

  await expect(page.locator('#test-case option')).toHaveCount(cases.length);
  for (const [id, fixture] of cases) {
    await page.locator('#test-case').selectOption(id);
    await expect(page.locator('#fixture')).toHaveValue(fixture);
    await expect(page.locator('#prepare')).toBeEnabled();
    await expect(page.locator('#play')).toBeDisabled();
  }

  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    targetHeights: ['prepare', 'enable', 'play', 'stop', 'abort', 'release', 'save-json', 'copy-json'].map((id) =>
      document.getElementById(id)?.getBoundingClientRect().height ?? 0),
  }));
  expect(layout.viewportWidth).toBe(320);
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(Math.min(...layout.targetHeights)).toBeGreaterThanOrEqual(44);

  await page.locator('#diagnostics').check();
  await expect(page.locator('#clock-chart')).toBeVisible();
  await page.locator('#diagnostics').uncheck();
  await expect(page.locator('#clock-chart')).toBeHidden();
});

test('fits tablet portrait and landscape in the WebKit touch profile', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'webkit' || !isMobile, 'Tablet screen geometry is checked in the WebKit touch profile.');
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await openQa(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator('#prepare')).toBeVisible();
  }
});
