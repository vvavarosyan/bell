import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help from the Bell.qa team.',
};

export default function SupportPage() {
  return (
    <ComingSoon
      title="Support"
      description="A dedicated support center is on the way. Until then, the contact form is the fastest way to reach us."
    />
  );
}
