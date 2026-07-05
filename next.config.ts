import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  { key: 'X-Frame-Options',              value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',       value: 'nosniff' },
  { key: 'Referrer-Policy',              value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',           value: 'camera=(), microphone=(self)' },
];

// Prevents the browser from serving a logged-in page from bfcache / disk cache
// after sign-out — otherwise the back button can render the workspace without
// a valid session.
const noStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
  { key: 'Pragma',        value: 'no-cache' },
  { key: 'Expires',       value: '0' },
];

const protectedSources = [
  '/workspace/:path*',
  '/dashboard/:path*',
  '/library/:path*',
  '/community/:path*',
  '/friends/:path*',
  '/settings/:path*',
  '/room/:path*',
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.0.2.2', '192.168.1.169'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      ...protectedSources.map((source) => ({
        source,
        headers: noStoreHeaders,
      })),
    ];
  },
};

const hasAuthToken = !!process.env.SENTRY_AUTH_TOKEN;

export default hasAuthToken
  ? withSentryConfig(nextConfig, {
      org: "studysync-ec",
      project: "javascript-nextjs",
      silent: true,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      webpack: {
        automaticVercelMonitors: true,
        treeshake: {
          removeDebugLogging: true,
        },
      },
    })
  : nextConfig;