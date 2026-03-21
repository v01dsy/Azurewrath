// app/sitemap.ts

import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://azurewrath.lol';

  return [
    { url: baseUrl,                   lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${baseUrl}/search`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/sales`,        lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.8 },
    { url: `${baseUrl}/deals`,        lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.8 },
    { url: `${baseUrl}/players`,      lastModified: new Date(), changeFrequency: 'daily',   priority: 0.7 },
    { url: `${baseUrl}/trade`,        lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.6 },
    { url: `${baseUrl}/snipe`,        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/news`,         lastModified: new Date(), changeFrequency: 'daily',   priority: 0.5 },
    { url: `${baseUrl}/verify`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    
  ];
}