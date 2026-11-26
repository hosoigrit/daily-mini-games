import { expect, test, type Page } from '@playwright/test';
import type { SaveDataV1 } from '../../src/contracts/interface_contracts';
import type {} from '../fixtures/a2c-storage-fixture';

const fixture = 'http://127.0.0.1:4173/daily-mini-games/games/0011_rhythm-factory/tests/fixtures/a2c-storage.html?isolated=playwright';

async function open(page: Page): Promise<void> {
  await page.goto(fixture);
  await page.waitForFunction(() => typeof window.a2cStorageProbe === 'object');
}

test('Stage A-2c / native exclusive ifAvailable allows one writer and reports takeover state', async ({ context }, info) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await Promise.all([open(a), open(b)]);
  const attempts = await Promise.all([a.evaluate(() => window.a2cStorageProbe!.show()), b.evaluate(() => window.a2cStorageProbe!.show())]);
  await info.attach('a2c-native-web-locks', { body: JSON.stringify(attempts), contentType: 'application/json' });
  expect(attempts.map(({ lease }) => lease.ok).filter(Boolean)).toHaveLength(1);

  const [owner, viewer] = attempts[0]!.lease.ok ? [a, b] : [b, a];
  const losingAttempt = attempts[0]!.lease.ok ? attempts[1]! : attempts[0]!;
  expect(losingAttempt.lease).toMatchObject({ ok: false, error: { code: 'ERR-009' } });
  const guard = await viewer.evaluate(() => window.a2cStorageProbe!.guard());
  expect(guard).toMatchObject({ view: { ok: true }, preview: { ok: true }, formal: { ok: false },
    practice: { ok: false }, calibration: { ok: false }, write: { ok: false } });
  expect(await viewer.evaluate(() => window.a2cStorageProbe!.setVolume(99))).toMatchObject({ ok: false });
  await owner.evaluate(() => localStorage.setItem('a2c-unrelated-sentinel', 'unrelated'));
  expect(await owner.evaluate(() => window.a2cStorageProbe!.setVolume(41))).toMatchObject({
    ok: true, value: { revision: 1, settings: { musicVolume: 41 } },
  });
  await owner.evaluate(() => window.a2cStorageProbe!.hide());
  expect(await owner.evaluate(() => window.a2cStorageProbe!.setVolumeWithPreviousLease(90))).toMatchObject({
    ok: false, error: { code: 'ERR-011' },
  });
  const takeover = await viewer.evaluate(() => window.a2cStorageProbe!.show());
  expect(takeover).toMatchObject({ lease: { ok: true }, save: { ok: true, value: { revision: 1, settings: { musicVolume: 41 } } } });
  expect(await viewer.evaluate(() => localStorage.getItem('a2c-unrelated-sentinel'))).toBe('unrelated');

  await viewer.close();
  // Browser process teardown can still be releasing its native lock when close() returns.
  // Poll from the test only. The application acquisition itself keeps ifAvailable.
  const afterClose: Awaited<ReturnType<NonNullable<Window['a2cStorageProbe']>['show']>>[] = [];
  await expect.poll(async () => {
    const attempt = await owner.evaluate(() => window.a2cStorageProbe!.show());
    afterClose.push(attempt);
    return attempt.lease.ok;
  }).toBe(true);
  expect(afterClose.at(-1)).toMatchObject({ lease: { ok: true, value: { generation: 2 } },
    save: { ok: true, value: { revision: 1 } } });
  expect(afterClose.slice(0, -1).every((attempt) => !attempt.lease.ok && attempt.lease.error.code === 'ERR-009')).toBe(true);
  await info.attach('a2c-native-takeover', { body: JSON.stringify({ guard, takeover, afterClose }), contentType: 'application/json' });
});

test('Stage A-2c / native LocalStorage receipt prevents double commit after caught readback failure', async ({ page }, info) => {
  await open(page);
  const start = await page.evaluate(() => window.a2cStorageProbe!.show());
  expect(start).toMatchObject({ lease: { ok: true }, save: { ok: true, value: { revision: 0 } } });
  const first = await page.evaluate(() => window.a2cStorageProbe!.saveClear('native-readback', true));
  expect(first).toMatchObject({ ok: false, error: { code: 'ERR-016' } });
  const blocked = await page.evaluate(() => window.a2cStorageProbe!.guard());
  expect(blocked).toMatchObject({ formal: { ok: false }, practice: { ok: true }, calibration: { ok: true }, write: { ok: false } });
  const retried = await page.evaluate(() => window.a2cStorageProbe!.retryClear('native-readback'));
  expect(retried).toMatchObject({ ok: true, value: { status: 'ALREADY_COMMITTED', receipt: { sessionId: 'native-readback', revision: 1 } } });
  const raw = await page.evaluate(() => window.a2cStorageProbe!.readRaw());
  const readback = JSON.parse(raw!) as SaveDataV1;
  expect(readback.records['CHART-01-E']?.clear?.clearCount).toBe(1);
  expect(readback.revision).toBe(1);
  const nextReplay = await page.evaluate(() => window.a2cStorageProbe!.retryClear('native-readback'));
  expect(nextReplay).toMatchObject({ ok: false, error: { code: 'ERR-018' } });
  await info.attach('a2c-native-local-storage', { body: JSON.stringify({ first, blocked, retried, readback, nextReplay }), contentType: 'application/json' });
});
