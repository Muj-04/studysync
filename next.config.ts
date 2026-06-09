import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    // Strip console.log in production; keep console.error and console.warn
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
};

export default nextConfig;
