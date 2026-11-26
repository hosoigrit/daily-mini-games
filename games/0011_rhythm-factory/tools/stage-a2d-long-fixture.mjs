/* global location, performance */
import { log } from 'node:console';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import { createServer as createViteServer } from 'vite';
import { performanceReference, summarizeSamples } from './stage-a2d-performance-metrics.ts';

const [outputPath, browserName = 'chromium'] = process.argv.slice(2);
const browsers = { chromium, firefox, webkit };
if (!outputPath || !Object.hasOwn(browsers, browserName)) {
  throw new Error('Usage: node tools/stage-a2d-long-fixture.mjs <json> [chromium|firefox|webkit]');
}

const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer();
const vite = await createViteServer({
  root, configFile: false, appType: 'custom', server: { middlewareMode: true, ws: false },
});
server.on('request', (request, response) => {
  if (request.url === '/__a2d_fixture84__') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      .end('<!doctype html><title>Stage A-2d isolated offline rendering</title>');
  } else vite.middlewares(request, response, () => response.writeHead(404).end());
});
const origin = 'http://127.0.0.1:4196';
const report = {
  scope: 'Existing 84-second technical fixture, production offline synthesis only; local browser, separate from the product subpath',
  browser: browserName, nodeVersion: process.version,
  context: 'three fresh browser contexts, local loopback, no real-time playback',
  trials: [],
};
let browser;
try {
  server.listen(4196, '127.0.0.1');
  await once(server, 'listening');
  const executablePath = browserName === 'webkit' ? process.env.STAGE_A1_WEBKIT_EXECUTABLE : undefined;
  browser = await browsers[browserName].launch(executablePath ? { executablePath } : {});
  report.browserVersion = browser.version();
  for (let run = 1; run <= performanceReference.coldGenerationTrials; run++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(origin + '/__a2d_fixture84__');
      const result = await page.evaluate(async () => {
        const { a2ar2LoadTrack } = await import(location.origin + '/tests/fixtures/a2ar2-load-track.ts');
        const { tickToUs } = await import(location.origin + '/src/domain/audio-clock.ts');
        const { renderMusicBuffer } = await import(location.origin + '/src/infrastructure/offline-music.ts');
        const startedAt = performance.now();
        const { buffer, durationUs } = await renderMusicBuffer(a2ar2LoadTrack, tickToUs);
        const renderMs = performance.now() - startedAt;
        const channels = buffer.numberOfChannels;
        const frames = buffer.length;
        let finite = true;
        let peak = 0;
        for (let channel = 0; channel < channels; channel++) {
          for (const sample of buffer.getChannelData(channel)) {
            if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
            else finite = false;
          }
        }
        return {
          renderMs, durationUs, channels, frames, sampleRate: buffer.sampleRate,
          pcmBytes: frames * channels * Float32Array.BYTES_PER_ELEMENT,
          peak, finite, scheduledEvents: a2ar2LoadTrack.events.length,
        };
      });
      report.trials.push({ run, status: 'OBSERVED', ...result });
      log(`84s fixture ${browserName} ${run}: ${result.renderMs.toFixed(1)}ms`);
    } catch (error) {
      report.trials.push({ run, status: 'FAILED', error: String(error) });
      process.exitCode = 1;
    } finally {
      await context.close();
    }
  }
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite.close();
  if (server.listening) {
    server.close();
    await once(server, 'close');
  }
  const renderMs = summarizeSamples(report.trials.flatMap(trial => trial.status === 'OBSERVED' ? [trial.renderMs] : []));
  report.aggregate = {
    renderMs,
    generationReference: renderMs.sampleCount < performanceReference.coldGenerationTrials ? 'UNMEASURED'
      : renderMs.median <= performanceReference.maximumColdGenerationMedianMs
        && renderMs.maximum <= performanceReference.maximumColdGenerationMs ? 'WITHIN_REFERENCE' : 'OUTSIDE_REFERENCE',
  };
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  log(output);
}
