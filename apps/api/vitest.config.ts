import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude archived tests from test runs
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/archived-tests/**',
      '**/.{idea,git,cache,output,temp}/**'
    ],
    // Timeout for long-running E2E tests
    testTimeout: 180000,
  },
});
