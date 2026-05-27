import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Bell.qa collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <ComingSoon
      title="Privacy Policy"
      description="Our privacy policy is being finalized with legal counsel. Get in touch if you have specific privacy questions before it publishes."
    />
  );
}
