import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sourceDigest = (path: string) =>
  createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');

export default defineConfig(({ command }) => {
  if (command === 'build') {
    const dirty = execFileSync('git', ['status', '--porcelain=v1', '--', '.'], { cwd: root, encoding: 'utf8' });
    if (dirty.trim()) throw new Error('Commit the QA source before generating a traceable build.');
    execFileSync('git', [
      'diff', '--exit-code', '8afe3cfb1d63920ba0c31c6391cc9a644ee24492',
      '--', '../../src', '../../tests/fixtures/a2ar2-load-track.ts', '../../package-lock.json',
    ], { cwd: root, stdio: 'pipe' });
  }
  return {
    root,
    base: './',
    publicDir: false,
    define: {
      __QA_METADATA__: JSON.stringify({
        qaHarnessVersion: '1.0.0',
        qaHarnessCommit: sourceCommit,
        productImplementationCommit: 'e34e1345e4ecd0fa0b251176f7af64136a46b0ee',
        baselineCommit: '8afe3cfb1d63920ba0c31c6391cc9a644ee24492',
        fixtureHashes: {
          'rotation-24': sourceDigest('../../src/content/stage-a2-trial.ts'),
          'load-84': sourceDigest('../../tests/fixtures/a2ar2-load-track.ts'),
        },
      }),
    },
    build: { outDir: 'dist', emptyOutDir: true, manifest: true },
  };
});
