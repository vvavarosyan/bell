import type { Metadata } from 'next';
import { GtmPageSections } from '@/components/gtm-page-sections';

export const metadata: Metadata = {
  title: 'GTM — Bell.qa',
  description:
    'Plan and run a market entry into Qatar. Sector × channel mapped, target accounts surfaced, partners shortlisted, regulatory path drawn — quarter by quarter on the Bell.qa graph.',
};

export default function GtmPage() {
  return <GtmPageSections />;
}
