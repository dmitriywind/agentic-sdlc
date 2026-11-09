import { defineConfig } from 'tsup';

// ponytail: no dts; the CLI is the product. Add dts when the library API is stable.
export default defineConfig({
  entry: ['src/bin.ts', 'src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  splitting: false,
});
