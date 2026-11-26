import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: { include: ['tests/**/*.test.ts'] },
  define: { __QA_METADATA__: JSON.stringify({
    qaHarnessVersion: 'test',
    qaHarnessCommit: 'TEST FIXTURE',
    productImplementationCommit: 'e34e1345e4ecd0fa0b251176f7af64136a46b0ee',
    baselineCommit: '8afe3cfb1d63920ba0c31c6391cc9a644ee24492',
    fixtureHashes: { 'rotation-24': 'TEST FIXTURE', 'load-84': 'TEST FIXTURE' },
  }) },
});
