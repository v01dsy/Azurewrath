/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.roblox.com',
        port: '',
        pathname: '/headshot-thumbnail/image/**',
      },
    ],
  },
};

export default nextConfig;