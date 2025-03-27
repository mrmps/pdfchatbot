const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const { FASTAPI_BASE_URL } = require('./lib/constants');

/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => {
    return [
      {
        source: "/api/py/:path*",
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
