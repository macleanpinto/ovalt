import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Read KEY=value from repo-root .env / .env.local (monorepo: Next runs in apps/web-nextjs). */
function readEnvVarFromRootFiles(key) {
  const root = path.join(__dirname, '..', '..');
  const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = new RegExp(`^\\s*${escKey}\\s*=\\s*`);
  for (const base of ['.env.local', '.env']) {
    let raw;
    try {
      raw = fs.readFileSync(path.join(root, base), 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      if (!prefix.test(line)) continue;
      let v = line.replace(prefix, '').trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"');
      else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      return v;
    }
  }
  return '';
}

const nextPublicGtmId =
  (process.env.NEXT_PUBLIC_GTM_ID && process.env.NEXT_PUBLIC_GTM_ID.trim()) ||
  readEnvVarFromRootFiles('NEXT_PUBLIC_GTM_ID').trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Lambda deployment
  output: 'standalone',

  // API endpoint configuration
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_GTM_ID: nextPublicGtmId,
  },

  // Image optimization for Lambda
  images: {
    unoptimized: false,
    domains: ['api.ovalt.org', 'api.tagrelay.io'],
  },

  // Disable X-Powered-By header
  poweredByHeader: false,

  // Compression
  compress: true,

  // React strict mode
  reactStrictMode: true,
};

export default nextConfig;
