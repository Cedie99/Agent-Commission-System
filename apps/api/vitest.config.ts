import { defineConfig } from 'vitest/config';

// Unit tests cover pure modules (redaction, import parsing, run transitions).
// Nest DI classes are not unit-tested here: esbuild doesn't emit decorator metadata.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
