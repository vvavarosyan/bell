import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How Bell.qa uses cookies and similar technologies.',
};

export default function CookiePolicyPage() {
  return (
    <ComingSoon
      title="Cookie Policy"
      description="Our cookie policy is being prepared alongside the privacy policy. Coming shortly."
    />
  );
}
