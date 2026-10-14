import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The browser only ever talks to the web app's own origin. Requests to /api/* are
  // forwarded to the Express API, so there is no CORS to configure and the auth cookies
  // (next milestone block) belong to one origin. See docs/decisions/0002.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
