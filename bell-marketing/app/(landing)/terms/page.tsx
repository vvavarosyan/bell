import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms under which you can use Bell.qa.',
};

export default function TermsPage() {
  return (
    <ComingSoon
      title="Terms of Service"
      description="Our terms of service are being finalized. Get in touch if you need to review them before they publish."
    />
  );
}
