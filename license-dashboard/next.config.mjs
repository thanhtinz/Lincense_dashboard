/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for the Dockerfile / Railway runner (copies .next/standalone).
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3001',
  },
  // All-in-one mode: proxy browser calls to /api/v1/* to the internal API
  // process (Express on 127.0.0.1:3001) so everything is one service/one URL.
  // Harmless in two-service mode (the client uses an absolute NEXT_PUBLIC_API_URL
  // and never hits this relative path).
  async rewrites() {
    const target = process.env.INTERNAL_API_URL || 'http://127.0.0.1:3001';
    return [
      { source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
