// next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // ADD THIS: Expose VAPID public key to the browser
  env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.roblox.com',
        port: '',
        pathname: '/headshot-thumbnail/image/**',
      },
      {
        protocol: 'https',
        hostname: 'www.roblox.com',
        port: '',
        pathname: '/asset-thumbnail/image/**',
      },
      {
        protocol: 'https',
        hostname: 'tr.rbxcdn.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  turbopack: {}, // Silences the warning
};

export default nextConfig;