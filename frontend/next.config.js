/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Note: 'standalone' output removed - Railway handles deployment without it
  // Allow images from any domain (for user uploads)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
}

module.exports = nextConfig

