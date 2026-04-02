import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/lambda-handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs', // Use CommonJS for Lambda
  outfile: 'dist/lambda-handler.js',
  external: [],
  minify: true,
  sourcemap: true,
});

console.log('✅ Lambda bundled successfully');
