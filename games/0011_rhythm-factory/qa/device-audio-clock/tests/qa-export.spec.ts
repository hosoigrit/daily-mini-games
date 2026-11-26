import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { makeEvidence } from '../src/model';

type Evidence = ReturnType<typeof makeEvidence>;

interface ClipboardFixture {
  text: string;
  reject: boolean;
}

interface TestWindow extends Window {
  qaClipboardFixture: ClipboardFixture;
}

async function downloadEvidence(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#save-json').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const artifact = await readFile(await download.path(), 'utf8');
  return { artifact, evidence: JSON.parse(artifact) as Evidence };
}

async function prepareAndStart(page: Page) {
  await page.locator('#prepare').click();
  await expect(page.locator('#enable')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#enable').click();
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#play').click();
}

async function simulateRealtimeClock(page: Page, driftMs: number) {
  // Exercise browser UI and the real offline renderer. Synthetic realtime readings
  // make UI branches deterministic and provide no audio-output or timing evidence.
  await page.addInitScript((driftMs) => {
    const startedAt = new WeakMap<AudioContext, number>();
    const closed = new WeakSet<AudioContext>();
    const playing = new WeakSet<AudioContext>();
    const prototype = AudioContext.prototype;
    const native = { close: prototype.close, createBufferSource: prototype.createBufferSource };
    function audioTime(context: AudioContext, now: number) {
      const start = startedAt.get(context);
      return start === undefined ? 0 : 1 + (now - start) / 1000;
    }

    Object.defineProperties(prototype, {
      resume: { configurable: true, value(this: AudioContext) {
        startedAt.set(this, performance.now());
        return Promise.resolve();
      } },
      close: { configurable: true, value(this: AudioContext) {
        closed.add(this);
        return native.close.call(this);
      } },
      state: { configurable: true, get(this: AudioContext) {
        if (closed.has(this)) return 'closed';
        return startedAt.has(this) ? 'running' : 'suspended';
      } },
      currentTime: { configurable: true, get(this: AudioContext) { return audioTime(this, performance.now()); } },
      getOutputTimestamp: { configurable: true, writable: true, value(this: AudioContext) {
        const now = performance.now();
        const drift = playing.has(this) ? driftMs / 1000 : 0;
        return { contextTime: audioTime(this, now) + drift, performanceTime: now };
      } },
      createBufferSource: { configurable: true, value(this: AudioContext) {
        playing.add(this);
        return native.createBufferSource.call(this);
      } },
    });
  }, driftMs);
}

function measuredEvidence(evidence: Evidence) {
  return { ...evidence, trials: evidence.trials.map((trial) => {
    // Export activity may append audit events. The measured result should be retained unchanged.
    const { events, ...measurement } = trial;
    void events;
    return measurement;
  }) };
}

test('exports a retained BLOCKED trial and supports copy and denied-copy fallback', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Native browser download event is covered in each managed desktop browser.');
  test.setTimeout(55_000);

  // Keep the real offline renderer and the actual QA UI. Inject permission denial only for this page.
  await page.addInitScript(() => {
    const fixture: ClipboardFixture = { text: '', reject: false };
    (window as unknown as TestWindow).qaClipboardFixture = fixture;
    Object.defineProperty(AudioContext.prototype, 'resume', {
      configurable: true,
      value: () => Promise.reject(new DOMException('QA test activation denied', 'NotAllowedError')),
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(value: string) {
          if (fixture.reject) throw new DOMException('QA test copy denied', 'NotAllowedError');
          fixture.text = value;
        },
      },
    });
  });

  await page.goto('/qa/device-audio-clock/');
  await page.locator('#test-case').selectOption('DEV-AUD-01');
  await page.locator('#prepare').click();
  await expect(page.locator('#enable')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#enable').click();
  const blocked = page.locator('#trial-results li[data-result="BLOCKED"]');
  await expect(blocked).toHaveCount(1);
  await expect(page.locator('#play')).toBeDisabled();

  const { artifact, evidence } = await downloadEvidence(page);
  expect(evidence).toMatchObject({
    schemaVersion: 1, formalStatus: 'HOLD', physicalDeviceVerified: false, percentileMethod: 'nearest-rank',
    summary: { executedTrials: 1, blockedTrials: 1, successfulTrials: 0 },
  });
  expect(evidence.trials).toHaveLength(1);
  expect(evidence.trials[0]).toMatchObject({
    testCaseId: 'DEV-AUD-01',
    fixtureId: 'rotation-24',
    status: 'BLOCKED',
    naturalCompletion: false,
    restarted: false,
    testConditions: { source: 'browser-qa', physicalDeviceVerified: false },
  });
  await info.attach('qa-blocked-export', { body: artifact, contentType: 'application/json' });

  await page.locator('#copy-json').click();
  const copied = await page.evaluate(() => (window as unknown as TestWindow).qaClipboardFixture.text);
  expect(measuredEvidence(JSON.parse(copied) as Evidence)).toEqual(measuredEvidence(evidence));

  await page.evaluate(() => { (window as unknown as TestWindow).qaClipboardFixture.reject = true; });
  await page.locator('#copy-json').click();
  await expect(page.locator('#json-output')).toBeVisible();
  const fallback = JSON.parse(await page.locator('#json-output').inputValue()) as Evidence;
  expect(measuredEvidence(fallback)).toEqual(measuredEvidence(evidence));
  await expect(blocked).toHaveCount(1);
});

test('requires download confirmation and runs DEV-AUD-05 again with a fresh generation (simulated clock)', async ({ page, browserName, isMobile }, info) => {
  test.skip(browserName !== 'chromium' || isMobile, 'This deterministic UI branch is independent of browser audio timing.');
  test.setTimeout(75_000);
  await simulateRealtimeClock(page, 0);
  await page.goto('/qa/device-audio-clock/');
  await page.locator('#test-case').selectOption('DEV-AUD-05');
  await prepareAndStart(page);

  const phase = page.locator('#phase');
  await expect(phase).toHaveAttribute('data-phase', 'awaiting-export');
  await expect(page.locator('#prepare')).toBeDisabled();
  const before = (await downloadEvidence(page)).evidence;
  const pending = before.trials[0]!;
  expect(pending).toMatchObject({ testCaseId: 'DEV-AUD-05', status: 'NOT RUN', released: true });
  expect(pending.preparations).toHaveLength(1);
  expect(pending.anchors).toHaveLength(1);
  expect(pending.observations).toHaveLength(1);
  await expect(phase).toHaveAttribute('data-phase', 'awaiting-export');

  await page.locator('#confirm-download').click();
  await expect(phase).toHaveAttribute('data-phase', 'rerun-ready');
  await prepareAndStart(page);
  await expect(phase).toHaveAttribute('data-outcome', 'pass');
  await expect(page.locator('#trial-results li[data-result="PASS"]')).toHaveCount(1);

  const { artifact, evidence } = await downloadEvidence(page);
  expect(evidence).toMatchObject({ formalStatus: 'HOLD', physicalDeviceVerified: false });
  expect(evidence.trials).toHaveLength(1);
  const rerun = evidence.trials[0]!;
  expect(rerun).toMatchObject({ trialId: pending.trialId, status: 'PASS', released: true, reason: 'trial.exportAndRerunVerified' });
  expect(rerun.preparations).toHaveLength(2);
  expect(rerun.events.map(event => event.kind)).toEqual(expect.arrayContaining(['export-download-requested', 'export-verified']));
  expect(rerun.anchors).toHaveLength(2);
  expect(rerun.anchors[1]!.generation).toBeGreaterThan(rerun.anchors[0]!.generation);
  expect(rerun.observations.map(point => point.generation)).toEqual(rerun.anchors.map(anchor => anchor.generation));
  await info.attach('qa-dev05-ui-simulated-clock', { body: artifact, contentType: 'application/json' });
});

test('retains the first over-limit sample and releases resources (simulated clock)', async ({ page, browserName, isMobile }, info) => {
  test.skip(browserName !== 'chromium' || isMobile, 'This deterministic UI branch is independent of browser audio timing.');
  test.setTimeout(45_000);
  await simulateRealtimeClock(page, 35);
  await page.goto('/qa/device-audio-clock/');
  await page.locator('#test-case').selectOption('DEV-AUD-01');
  await prepareAndStart(page);

  await expect(page.locator('#phase')).toHaveAttribute('data-outcome', 'fail');
  await expect(page.locator('#trial-results li[data-result="FAIL"]')).toHaveCount(1);
  await expect(page.locator('#play')).toBeDisabled();

  const { artifact, evidence } = await downloadEvidence(page);
  expect(evidence.trials).toHaveLength(1);
  const trial = evidence.trials[0]!;
  expect(trial).toMatchObject({ status: 'FAIL', released: true, reason: 'clock.outOfSync' });
  expect(trial.observations).toHaveLength(1);
  expect(trial.observations[0]).toMatchObject({ valid: true, overLimit: true, safetyStopReason: 'clock.outOfSync' });
  expect(trial.observations[0]!.absoluteDifferenceMs).toBeCloseTo(35, 4);
  await info.attach('qa-over-limit-ui-simulated-clock', { body: artifact, contentType: 'application/json' });
});

test('records the native short-track activation and clock outcome without forcing PASS', async ({ page, browser, browserName, isMobile }, info) => {
  test.skip(isMobile, 'This native audio path runs once per managed desktop engine. Mobile profiles check the responsive UI.');
  test.setTimeout(45_000);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/qa/device-audio-clock/');
  await page.locator('#test-case').selectOption('DEV-AUD-01');
  const phase = page.locator('#phase');
  await page.locator('#prepare').click();
  await expect(phase).toHaveAttribute('data-phase', 'prepared', { timeout: 30_000 });
  await page.locator('#enable').click();
  await expect(phase).toHaveAttribute('data-phase', /^(enabled|finished)$/);
  if (await phase.getAttribute('data-phase') === 'enabled') await page.locator('#play').click();
  await expect(phase).toHaveAttribute('data-phase', 'finished');

  const { artifact, evidence } = await downloadEvidence(page);
  expect(evidence).toMatchObject({ formalStatus: 'HOLD', physicalDeviceVerified: false });
  expect(evidence.trials).toHaveLength(1);
  const trial = evidence.trials[0]!;
  expect(trial).toMatchObject({ testCaseId: 'DEV-AUD-01', fixtureId: 'rotation-24', released: true });
  expect(trial.preparations).toHaveLength(1);
  expect(trial.preparations[0]).toMatchObject({
    durationSec: 24, sampleRate: 48_000, channels: 2, frames: 1_152_000, pcmBytes: 9_216_000,
    nonfiniteSamples: 0, float32: true,
  });
  expect(trial.events.some(({ kind }) => kind === 'trusted-enable')).toBe(true);
  if (trial.status === 'PASS') {
    expect(trial).toMatchObject({ activation: 'SUCCESS', anchor: 'SUCCESS', reason: 'trial.anchorVerified' });
    expect(trial.observations).toHaveLength(1);
    expect(trial.observations[0]).toMatchObject({ valid: true, overLimit: false, reason: null });
    expect(trial.observations[0]!.absoluteDifferenceMs).toBeLessThanOrEqual(20);
  } else if (trial.status === 'FAIL') {
    expect(trial.activation).toBe('SUCCESS');
    expect(trial.reason).toMatch(/^(clock|audio)\./);
    if (trial.reason === 'clock.outOfSync') {
      expect(trial.observations[0]).toMatchObject({ valid: true, overLimit: true, safetyStopReason: 'clock.outOfSync' });
      expect(trial.observations[0]!.absoluteDifferenceMs).toBeGreaterThan(20);
    }
  } else {
    expect(trial.status).toBe('BLOCKED');
    expect(trial.reason).toMatch(/^(audio\.gestureRequired|qa\.activationObservationEnded|clock\.noAnchor)$/);
    expect(trial.observations).toHaveLength(0);
  }
  await expect(page.locator(`#trial-results li[data-result="${trial.status}"]`)).toHaveCount(1);
  const outgoing = requests.filter((url) => new URL(url).origin !== new URL(page.url()).origin);
  expect(outgoing).toEqual([]);
  await info.attach('qa-native-clock-visit', { contentType: 'application/json', body: JSON.stringify({ browserName, version: browser.version(), outcome: trial.status, outgoing }) });
  await info.attach('qa-native-clock-evidence', { body: artifact, contentType: 'application/json' });
});

test('prepares, exports, and releases the native 84-second load fixture in Firefox', async ({ page, browserName, isMobile }, info) => {
  test.skip(browserName !== 'firefox' || isMobile, 'Exercise one native 84-second render without observing a realtime clock.');
  test.setTimeout(60_000);
  await page.goto('/qa/device-audio-clock/');
  await page.locator('#test-case').selectOption('DEV-AUD-04');
  await page.locator('#prepare').click();
  await expect(page.locator('#phase')).toHaveAttribute('data-phase', 'prepared', { timeout: 45_000 });
  await page.locator('#release').click();
  await expect(page.locator('#phase')).toHaveAttribute('data-outcome', 'aborted');

  const { artifact, evidence } = await downloadEvidence(page);
  expect(evidence.trials).toHaveLength(1);
  const trial = evidence.trials[0]!;
  expect(trial).toMatchObject({
    testCaseId: 'DEV-AUD-04', fixtureId: 'load-84', status: 'ABORTED', released: true,
    activation: 'NOT RUN', anchor: 'NOT RUN', observations: [], naturalCompletion: false,
  });
  expect(trial.preparations).toHaveLength(1);
  const preparation = trial.preparations[0]!;
  expect(preparation).toMatchObject({
    durationSec: 84, sampleRate: 48_000, channels: 2, frames: 4_032_000, pcmBytes: 32_256_000,
    nonfiniteSamples: 0, float32: true,
  });
  expect(preparation.bgmPeak).toBeGreaterThan(0);
  expect(preparation.audibleHalfSecondBlocks).toBeGreaterThan(0);
  await info.attach('qa-native-84-second-render', { body: artifact, contentType: 'application/json' });
});

test('keeps manual fallback distinct from clipboard and restarts only after confirmation (TEST FIXTURE)', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Deterministic UI branch using simulated realtime clock.');
  test.setTimeout(75_000);
  await simulateRealtimeClock(page, 0);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: () => Promise.reject(new DOMException('TEST FIXTURE', 'NotAllowedError')) },
  }));
  await page.goto('/qa/device-audio-clock/');
  await page.locator('#test-case').selectOption('DEV-AUD-05');
  await prepareAndStart(page);
  await expect(page.locator('#phase')).toHaveAttribute('data-phase', 'awaiting-export');
  await page.locator('#copy-json').click();
  await expect(page.locator('#json-output')).toBeVisible();
  expect(JSON.parse(await page.locator('#json-output').inputValue()).trials[0].status).toBe('NOT RUN');
  await expect(page.locator('#prepare')).toBeDisabled();
  await page.locator('#confirm-manual-copy').click();
  await prepareAndStart(page);
  await expect(page.locator('#phase')).toHaveAttribute('data-outcome', 'pass');
  const { evidence } = await downloadEvidence(page);
  const events = evidence.trials[0]!.events.map(({ kind }) => kind);
  expect(events).toContain('export-clipboard-failed');
  expect(events).toContain('export-manual-user-confirmed');
  expect(events).not.toContain('export-clipboard-confirmed');
});

test('stops visibly and resumes through a distinct fixed clock generation (TEST FIXTURE)', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Deterministic UI branch using simulated realtime clock.');
  test.setTimeout(45_000);
  await simulateRealtimeClock(page, 0);
  await page.goto('/qa/device-audio-clock/');
  await page.locator('#test-case').selectOption('DEV-AUD-03');
  await prepareAndStart(page);
  await expect(page.locator('#valid-samples')).not.toHaveText('0');
  await page.locator('#stop').click();
  await expect(page.locator('#phase')).toHaveAttribute('data-phase', 'stopped');
  await page.locator('#resume').click();
  await expect(page.locator('#phase')).toHaveAttribute('data-outcome', 'pass');
  const { evidence } = await downloadEvidence(page);
  const trial = evidence.trials[0]!;
  expect(trial).toMatchObject({ status: 'PASS', restarted: true, released: true });
  expect(trial.anchors).toHaveLength(2);
  expect(trial.anchors[1]!.generation).toBeGreaterThan(trial.anchors[0]!.generation);
  expect(trial.observations.filter(o => o.generation === trial.anchors[1]!.generation)).toHaveLength(10);
});
