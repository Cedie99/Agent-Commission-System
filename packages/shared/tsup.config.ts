import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/money.ts', 'src/enums.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // decimal.js must stay external so every package shares one Decimal class.
  external: ['decimal.js', 'zod'],
});
