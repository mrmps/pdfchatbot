const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

// Import constants from the CommonJS version
const { FASTAPI_BASE_URL, getApiUrl } = require('./lib/constants.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => {
    return [
      // Direct routes to the external API
      {
        source: "/api/:path*",
        destination: `${FASTAPI_BASE_URL}/:path*`,
      },
      {
        source: "/docs",
        destination: `${FASTAPI_BASE_URL}/docs`,
      },
      {
        source: "/openapi.json",
        destination: `${FASTAPI_BASE_URL}/openapi.json`,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Use output: 'standalone' for production builds to optimize
  output: 'standalone',
};

module.exports = withBundleAnalyzer(nextConfig);
