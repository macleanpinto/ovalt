import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root (tag-relay/) — workspace deps live in root node_modules */
const repoRoot = path.resolve(__dirname, '../..');
const entry = path.join(__dirname, 'src/lambda-handler.ts');
const outfile = path.join(__dirname, 'dist/lambda-handler.js');

/**
 * CommonJS bundle — AWS Lambda loads `lambda-handler.handler` as CJS unless
 * package.json has "type":"module" or the file is `.mjs`. ESM output caused
 * "Cannot use import statement outside a module" at runtime.
 */
await esbuild.build({
  absWorkingDir: repoRoot,
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile,
  external: [],
  minify: true,
  sourcemap: true,
  nodePaths: [path.join(repoRoot, 'node_modules')]
});

console.log('✅ Worker Lambda bundled successfully (CJS)');
