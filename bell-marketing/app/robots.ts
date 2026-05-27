import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: 'https://bell.qa/sitemap.xml',
    host:    'https://bell.qa',
  };
}
