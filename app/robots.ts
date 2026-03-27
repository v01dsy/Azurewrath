// app/robots.ts

import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/auth/',
        '/api/dev/',
        '/api/user/',
        '/api/admin/',
        '/admin/',
      ],
    },
    sitemap: 'https://azurewrath.lol/sitemap.xml',
  };
}