/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Lambda deployment
  output: 'standalone',

  // API endpoint configuration
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
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
