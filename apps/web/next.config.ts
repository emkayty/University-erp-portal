import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  // ── Environment variables exposed to browser ──────────────────────────────
  env: {
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001',
  },

  // ── Image domains (S3 CloudFront CDN) ────────────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.cloudfront.net',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/**',
      },
    ],
  },

  // ── Security headers ──────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',        value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  // ── Redirect root to dashboard ────────────────────────────────────────────
  async redirects() {
    return [
      {
        source:      '/',
        destination: '/dashboard',
        permanent:   false,
      },
    ];
  },

  // ── Bundle analyser (enable with ANALYZE=true pnpm build) ─────────────────
  ...(process.env['ANALYZE'] === 'true'
    ? { webpack: (config: { plugins: unknown[] }) => config }
    : {}),
};

export default nextConfig;
