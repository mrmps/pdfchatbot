const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites: async () => {
    return [
      {
        source: "/api/py/:path*",
        destination:
          process.env.NODE_ENV === "development"
            ? "http://127.0.0.1:8000/api/py/:path*"
            : "/api/",
      },
      {
        source: "/docs",
        destination:
          process.env.NODE_ENV === "development"
            ? "http://127.0.0.1:8000/api/py/docs"
            : "/api/py/docs",
      },
      {
        source: "/openapi.json",
        destination:
          process.env.NODE_ENV === "development"
            ? "http://127.0.0.1:8000/api/py/openapi.json"
            : "/api/py/openapi.json",
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Configure output file tracing to optimize serverless functions
  output: 'standalone',
  outputFileTracing: true,
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@next/swc-*',
      'node_modules/next/dist/compiled/@swc/*',
      'node_modules/pdfjs-dist/**',
      'node_modules/@langchain/**',
      'node_modules/openai/**',
      '.git/**',
      '**.*.map',
      '**.*.d.ts',
      'venv/**',
      '*/test/**',
      'node_modules/kdbai-client/**',
      'node_modules/pdf-parse/**'
    ],
  },
};

module.exports = withBundleAnalyzer(nextConfig);
