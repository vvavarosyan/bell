/**
 * Site-wide Schema.org structured data (JSON-LD), rendered once in the root
 * layout. Three entities:
 *   • Organization        — brand identity, logo, social profiles (sameAs)
 *   • WebSite             — site entity Google uses for sitelinks
 *   • SoftwareApplication — the Bell.qa platform itself
 *
 * Deliberately HONEST: no fabricated ratings, reviews, or prices. Facts here
 * must match the canonical site numbers (130k+ companies, 1.6M+ people…).
 */
import { SOCIAL_LINKS } from '@/content/navigation';

const ORG = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://bell.qa/#organization',
  name: 'Bell Data Intelligence',
  alternateName: 'Bell.qa',
  url: 'https://bell.qa',
  logo: 'https://bell.qa/og.png',
  description:
    'Bell Data Intelligence (Bell.qa) is the intelligence layer for Qatar’s economy — every Qatari company, every executive, every job opening, unified, verified, and searchable.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Doha',
    addressCountry: 'QA',
  },
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@bell.qa',
      url: 'https://bell.qa/support',
      availableLanguage: ['English', 'Arabic'],
    },
  ],
  sameAs: SOCIAL_LINKS.map(s => s.href),
};

const WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': 'https://bell.qa/#website',
  url: 'https://bell.qa',
  name: 'Bell.qa',
  publisher: { '@id': 'https://bell.qa/#organization' },
  inLanguage: 'en',
};

const APP = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': 'https://bell.qa/#app',
  name: 'Bell Data Intelligence',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://app.bell.qa',
  description:
    'Qatar business intelligence platform: 191,000+ Qatari companies, 1.6M+ people in the graph, all named decision-makers, 500+ datapoints per record — with search, signals, maps, CRM, and research.',
  offers: {
    '@type': 'Offer',
    url: 'https://bell.qa/pricing',
    priceCurrency: 'QAR',
    category: 'subscription',
  },
  publisher: { '@id': 'https://bell.qa/#organization' },
};

export function SeoJsonLd() {
  return (
    <>
      {[ORG, WEBSITE, APP].map((obj, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
        />
      ))}
    </>
  );
}
