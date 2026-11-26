import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

const mount = '/daily-mini-games/games/0011_rhythm-factory/';
const webkitExecutable = process.env.STAGE_A1_WEBKIT_EXECUTABLE;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        ...(webkitExecutable ? { launchOptions: { executablePath: webkitExecutable } } : {}),
      },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --base ${mount}`,
      url: `http://127.0.0.1:4173${mount}`,
    },
    {
      command: 'node tools/serve-subpath.mjs',
      url: `http://127.0.0.1:4174${mount}`,
    },
    {
      command: `npm run dev -- --config tests/browser/fixtures/foundation/vite.config.ts --host 127.0.0.1 --port 4175 --strictPort --base ${mount}`,
      url: `http://127.0.0.1:4175${mount}`,
    },
    {
      command: 'npm run build -- --config tests/browser/fixtures/foundation/vite.config.ts && node tools/serve-subpath.mjs node_modules/.cache/game0011/a1-foundation-dist 4176',
      url: `http://127.0.0.1:4176${mount}`,
    },
  ],
});
