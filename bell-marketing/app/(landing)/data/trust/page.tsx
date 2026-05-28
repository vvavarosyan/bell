import type { Metadata } from 'next';
import { TrustPageSections } from '@/components/trust-page-sections';

export const metadata: Metadata = {
  title: 'Trust — Bell.qa Data',
  description:
    'Built in Qatar. Hosted in Qatar. Yours to remove. Bell.qa is sovereign-grade by design — Qatari servers, Qatari operators, Qatari compliance. Every fact cited, every record auditable, every individual entitled to see, correct, and remove their data.',
};

export default function TrustPage() {
  return <TrustPageSections />;
}
