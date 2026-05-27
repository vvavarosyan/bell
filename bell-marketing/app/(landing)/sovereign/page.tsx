import type { Metadata } from 'next';
import { SovereignSections } from '@/components/sovereign-sections';

export const metadata: Metadata = {
  title: 'Sovereign & Government Licensing',
  description:
    'Annual platform licensing for Qatari ministries, regulators, and sovereign entities. Includes the BIN data exchange layer. NDA-first engagement, briefings by request.',
  // Sovereign licensing is sensitive. We want this page accessible to anyone
  // who finds it (footer link, direct referral), but not aggressively indexed.
  robots: {
    index:  true,
    follow: true,
    nocache: true,
  },
};

export default function SovereignPage() {
  return <SovereignSections />;
}
