import type { Metadata } from 'next';
import { MarketingPageSections } from '@/components/marketing-page-sections';

export const metadata: Metadata = {
  title: 'Marketing — Bell.qa',
  description:
    'Campaigns no one else can run. Bell.qa gives marketing teams the trigger-based plays, the audience depth, and the autonomous execution to reach every Qatari account at the right moment.',
};

export default function MarketingPage() {
  return <MarketingPageSections />;
}
