import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: { include: ['tests/{unit,contract,integration,component}/**/*.test.{ts,tsx}'] },
});
