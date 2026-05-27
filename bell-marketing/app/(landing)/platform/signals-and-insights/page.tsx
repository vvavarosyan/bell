import type { Metadata } from 'next';
import { SignalsPageSections } from '@/components/signals-page-sections';

export const metadata: Metadata = {
  title: 'Signals & Insights — Bell.qa',
  description:
    'The live signal stream across the Qatari market. Filings, leadership changes, licences, expansions, RFPs, funding — all picked up the moment they land, routed to the right team, on every Bell.qa workspace.',
};

export default function SignalsPage() {
  return <SignalsPageSections />;
}
