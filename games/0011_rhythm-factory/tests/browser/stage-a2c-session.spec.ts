import { expect, test } from '@playwright/test';

const fixture = 'http://127.0.0.1:4173/daily-mini-games/games/0011_rhythm-factory/tests/fixtures/a2c-session.html?a2c-test-only=1';

test('A-2c native composition readies original offline track and protected storage on the subpath', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(fixture);
  const state = page.getByLabel('セッション状態');
  await expect(state).toContainText('"ownsWriter":true');
  await expect(state).toContainText('"sessionId":null');
  await page.getByRole('button', { name: '準備', exact: true }).click();
  await expect(page.getByRole('button', { name: '開始', exact: true })).toBeEnabled({ timeout: 25_000 });
  await expect(state).toContainText('"selectedReady":true');
  await expect(state).toContainText('"state":"READY"');
  expect(errors).toEqual([]);
});
