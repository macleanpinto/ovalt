import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/lambda-handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/lambda-handler.js',
  external: [],
  banner: {
    js: `import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);`
  },
  minify: true,
  sourcemap: true,
});

console.log('✅ Worker Lambda bundled successfully');
