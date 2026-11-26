import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const gameRoot = fileURLToPath(new URL('../../', import.meta.url));
const preview = process.env.STAGE_A2A_QA_TEST_PREVIEW === '1';
const port = preview ? 4184 : 4183;
const mount = '/qa/device-audio-clock/';
const origin = `http://127.0.0.1:${port}`;
const vite = preview ? 'node_modules/.bin/vite preview' : 'node_modules/.bin/vite';
const webkitExecutable = process.env.STAGE_A1_WEBKIT_EXECUTABLE;
const webkitLaunch = webkitExecutable ? { launchOptions: { executablePath: webkitExecutable } } : {};

export default defineConfig({
  testDir: './tests',
  testMatch: 'qa-*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: origin,
    acceptDownloads: true,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], ...webkitLaunch } },
    { name: 'chromium-android-emulation', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-ios-emulation', use: { ...devices['iPhone 13'], ...webkitLaunch } },
  ],
  webServer: {
    cwd: gameRoot,
    command: `${vite} --config qa/device-audio-clock/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort --base ${mount}`,
    url: origin + mount,
    reuseExistingServer: false,
  },
});
