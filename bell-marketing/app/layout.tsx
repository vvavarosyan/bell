import type { Metadata } from 'next';
import { Nav }          from '@/components/nav';
import { Footer }       from '@/components/footer';
import { ScrollToTop }  from '@/components/scroll-to-top';
import { SeoJsonLd }    from '@/components/seo-jsonld';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://bell.qa'),
  title: {
    default:  'Bell.qa — The intelligence layer for Qatar\'s economy',
    template: '%s · Bell.qa',
  },
  description:
    'Every Qatari company, every executive, every job opening — unified, verified, and searchable. Bell.qa is the operating system for Qatar business intelligence.',
  applicationName: 'Bell.qa',
  keywords: [
    'Qatar business intelligence', 'Qatar company database', 'Qatar companies directory',
    'Qatar B2B data', 'Qatar sales intelligence', 'Doha companies', 'Qatar market data',
    'QFC companies', 'Qatar business directory', 'Qatar decision makers',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://bell.qa',
    siteName: 'Bell.qa',
    title: 'Bell.qa — The intelligence layer for Qatar\'s economy',
    description:
      'Every Qatari company, every executive, every job opening — unified, verified, and searchable. Bell.qa is the operating system for Qatar business intelligence.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Bell Data Intelligence — the intelligence layer for Qatar\'s economy' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@BellDataIntel',
    title: 'Bell.qa — The intelligence layer for Qatar\'s economy',
    description:
      'Every Qatari company, every executive, every job opening — unified, verified, and searchable.',
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {/* Resource hints for the Mapbox-backed live map (React hoists these
            into <head>). Schema.org JSON-LD rides along site-wide. */}
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="anonymous" />
        <SeoJsonLd />
        <ScrollToTop />
        <Nav />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
