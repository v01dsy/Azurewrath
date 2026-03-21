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
    unoptimized: true,
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
      { hostname: 'tr.rbxcdn.com' },
      { hostname: 't0.rbxcdn.com' },
      { hostname: 't1.rbxcdn.com' },
      { hostname: 't2.rbxcdn.com' },
      { hostname: 't3.rbxcdn.com' },
      { hostname: 't4.rbxcdn.com' },
      { hostname: 't5.rbxcdn.com' },
      { hostname: 't6.rbxcdn.com' },
      { hostname: 't7.rbxcdn.com' },
    ],
  },
  turbopack: {}, // Silences the warning
};

export default nextConfig;