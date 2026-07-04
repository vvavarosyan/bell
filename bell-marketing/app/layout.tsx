import type { Metadata } from 'next';
import Script            from 'next/script';
import { Nav }          from '@/components/nav';
import { Footer }       from '@/components/footer';
import { ScrollToTop }  from '@/components/scroll-to-top';
import { SeoJsonLd }    from '@/components/seo-jsonld';
import { BellaWidget }  from '@/components/bella-widget';
import './globals.css';

// Google Analytics 4 — enabled only when the Measurement ID is configured
// (NEXT_PUBLIC_GA_ID on the marketing service). No ID → no tracking, no error.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

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
        {/* Bella — the site guide (streams from the portal's public endpoint;
            this service holds no AI key and no data). */}
        <BellaWidget />
        {GA_ID ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
