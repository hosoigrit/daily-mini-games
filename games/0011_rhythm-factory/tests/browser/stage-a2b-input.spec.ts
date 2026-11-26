import { expect, test, type Page } from '@playwright/test';
import type { InputFixtureEvidence } from '../fixtures/a2b-input-fixture';

const fixtureUrl = 'http://127.0.0.1:4173/daily-mini-games/games/0011_rhythm-factory/tests/fixtures/a2b-input.html';

async function openFixture(page: Page): Promise<void> {
  await page.goto(fixtureUrl);
  await expect(page.locator('#fixture-evidence')).not.toBeEmpty();
}

async function readEvidence(page: Page): Promise<InputFixtureEvidence> {
  return JSON.parse((await page.locator('#fixture-evidence').textContent()) ?? '') as InputFixtureEvidence;
}

function checkTimings({ inputs }: InputFixtureEvidence): void {
  expect(inputs.length).toBeGreaterThan(0);
  expect(new Set(inputs.map((input) => input.eventId)).size).toBe(inputs.length);
  for (const [index, input] of inputs.entries()) {
    expect(input.sessionId).toBe('stage-a2b-input-fixture');
    expect(input.clockGeneration).toBe(3);
    expect(input.eventPerformanceMs).toBeGreaterThanOrEqual(0);
    expect(input.receivedPerformanceMs).toBeGreaterThanOrEqual(input.eventPerformanceMs);
    expect(Number.isSafeInteger(input.songTimeUs)).toBe(true);
    expect(input.judgeTimeUs).toBe(input.songTimeUs - 20_000);
    if (index > 0) expect(input.sequence).toBeGreaterThan(inputs[index - 1]!.sequence);
  }
}

test('Stage A-2b / real keyboard uses physical lanes, IF-04 and a distinct feedback path', async ({ page }, info) => {
  await openFixture(page);
  await page.keyboard.down('d');
  await page.keyboard.down('d');
  await page.keyboard.down('f');
  await page.keyboard.up('d');
  await page.keyboard.up('f');
  await page.keyboard.press('j');
  await page.keyboard.press('k');
  await page.keyboard.press('Escape');

  const evidence = await readEvidence(page);
  await info.attach('a2b-input-keyboard-evidence', { body: JSON.stringify(evidence), contentType: 'application/json' });
  expect(evidence.inputs.map(({ inputId, lane, action }) => [inputId, lane, action])).toEqual([
    ['keyboard:KeyD', 1, 'DOWN'], ['keyboard:KeyF', 2, 'DOWN'],
    ['keyboard:KeyD', 1, 'UP'], ['keyboard:KeyF', 2, 'UP'],
    ['keyboard:KeyJ', 3, 'DOWN'], ['keyboard:KeyJ', 3, 'UP'],
    ['keyboard:KeyK', 4, 'DOWN'], ['keyboard:KeyK', 4, 'UP'],
  ]);
  expect(evidence.physical).toEqual([[1], [1, 2], [2], [], [3], [], [4], []]);
  checkTimings(evidence);
});

test('Stage A-2b / native pointer capture keeps release on the starting lane', async ({ page }, info) => {
  await openFixture(page);
  const first = page.getByRole('button', { name: 'レーン1' });
  const second = page.getByRole('button', { name: 'レーン2' });
  const firstBox = (await first.boundingBox())!;
  const secondBox = (await second.boundingBox())!;
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
  await page.mouse.up();
  await first.dispatchEvent('mousedown');
  await first.dispatchEvent('mouseup');
  await first.dispatchEvent('click');

  const evidence = await readEvidence(page);
  await info.attach('a2b-input-capture-evidence', { body: JSON.stringify(evidence), contentType: 'application/json' });
  expect(evidence.pointerDown).toEqual([{ lane: 1, trusted: true, pointerType: 'mouse' }]);
  expect(evidence.capture).toMatchObject([{ lane: 1, trusted: true }]);
  expect(evidence.inputs.map(({ lane, action }) => [lane, action])).toEqual([[1, 'DOWN'], [1, 'UP']]);
  expect(evidence.inputs[0]!.inputId).toBe(evidence.inputs[1]!.inputId);
  expect(evidence.physical).toEqual([[1], []]);
  expect(evidence.cancellations).toEqual([]);
  checkTimings(evidence);
});

test.describe('Stage A-2b touch emulation', () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 568 } });

  test('native touch events reach the real DOM and normalize once per direction', async ({ page }, info) => {
    await openFixture(page);
    await page.getByRole('button', { name: 'レーン3' }).tap();
    const evidence = await readEvidence(page);
    await info.attach('a2b-input-touch-evidence', { body: JSON.stringify(evidence), contentType: 'application/json' });
    expect(evidence.pointerDown).toEqual([{ lane: 3, trusted: true, pointerType: 'touch' }]);
    expect(evidence.inputs.map(({ lane, action }) => [lane, action])).toEqual([[3, 'DOWN'], [3, 'UP']]);
    expect(evidence.physical).toEqual([[3], []]);
    expect(evidence.cancellations).toEqual([]);
    checkTimings(evidence);
  });
});
