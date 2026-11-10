import { defineConfig } from 'tsup';

// ponytail: no dts; the CLI is the product. Add dts when the library API is stable.
export default defineConfig({
  entry: ['src/bin.ts', 'src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  splitting: false,
  // Bundled: a plugin installed from Git has no node_modules.
  noExternal: ['yaml'],
  // yaml's CJS build calls require('process'); ESM has no require.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
