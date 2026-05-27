import type { Metadata } from 'next';
import { Nav }          from '@/components/nav';
import { Footer }       from '@/components/footer';
import { ScrollToTop }  from '@/components/scroll-to-top';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://bell.qa'),
  title: {
    default:  'Bell.qa — The intelligence layer for Qatar\'s economy',
    template: '%s · Bell.qa',
  },
  description:
    'Every Qatari company, every executive, every job opening — unified, verified, and searchable. Bell.qa is the operating system for Qatar business intelligence.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://bell.qa',
    siteName: 'Bell.qa',
    title: 'Bell.qa — The intelligence layer for Qatar\'s economy',
    description:
      'Every Qatari company, every executive, every job opening — unified, verified, searchable.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bell.qa — The intelligence layer for Qatar\'s economy',
    description:
      'Every Qatari company, every executive, every job opening — unified, verified, searchable.',
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
