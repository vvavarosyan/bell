import type { Metadata } from 'next';
import { ZeroRiskSections } from '@/components/zero-risk-sections';

export const metadata: Metadata = {
  title: '0 Risk Agreement — Clients now, pay only when you win',
  description:
    'For companies that need customers but aren’t ready to subscribe. Bell provides a list of perfectly-matched, deeply-researched prospects at no upfront cost — you pay a 15% share only of the revenue you earn from them.',
  robots: { index: true, follow: true },
};

export default function ZeroRiskPage() {
  return <ZeroRiskSections />;
}
