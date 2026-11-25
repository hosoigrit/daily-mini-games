import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'reports/**', 'test-results/**', 'playwright-report/**', 'src/contracts/interface_contracts.d.ts'] },
  { files: ['**/*.{js,mjs,ts,tsx}'], ...eslint.configs.recommended },
  ...tseslint.configs.recommended,
  { files: ['**/*.tsx'], plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'performance', 'Date', 'AudioContext', 'requestAnimationFrame'],
    },
  },
];
