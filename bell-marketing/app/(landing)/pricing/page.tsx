import type { Metadata } from 'next';
import { PricingSections } from '@/components/pricing-sections';

export const metadata: Metadata = {
  title: 'Pricing & Access',
  description:
    'Bell.qa is an approval-only intelligence platform for Qatar. Three commercial tiers, transparent pricing in QAR, plus sovereign licensing for ministries and regulators.',
};

export default function PricingPage() {
  return <PricingSections />;
}
