/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for the Dockerfile / Railway runner (copies .next/standalone).
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3001',
  },
};

export default nextConfig;
