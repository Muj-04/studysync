import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  { key: 'X-Frame-Options',              value: 'DENY' },
  { key: 'X-Content-Type-Options',       value: 'nosniff' },
  { key: 'Referrer-Policy',              value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',           value: 'camera=(), microphone=(self)' },
];

const nextConfig: NextConfig = {
  compiler: {
    // Strip console.log in production; keep console.error and console.warn
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
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress Sentry CLI output unless on CI
  silent: !process.env.CI,
  // Don't upload source maps (requires SENTRY_AUTH_TOKEN)
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  // Disable automatic instrumentation of Vercel cron monitors
  automaticVercelMonitors: false,
  // Disable Sentry telemetry
  telemetry: false,
});
