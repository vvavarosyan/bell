import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Our Data',
  description: 'Where Bell.qa\'s data comes from, how it\'s verified, and how often it refreshes.',
};

export default function OurDataPage() {
  return (
    <ComingSoon
      title="Our Data"
      description="A deep dive on the dataset — every authoritative source, how we enrich and verify each record, refresh cadence, coverage, and quality guarantees."
    />
  );
}
