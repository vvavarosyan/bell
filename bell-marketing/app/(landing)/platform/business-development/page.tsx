import type { Metadata } from 'next';
import { BdPageSections } from '@/components/bd-page-sections';

export const metadata: Metadata = {
  title: 'Business Development — Bell.qa',
  description:
    'Targets mapped, ownership graphs drawn, warm paths found, signals monitored at quarterly cadence. Bell.qa is the BD intelligence layer for Qatari M&A, partnerships, and joint ventures.',
};

export default function BdPage() {
  return <BdPageSections />;
}
