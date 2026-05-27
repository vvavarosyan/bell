import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Bell.qa team about access, partnerships, or feedback.',
};

export default function ContactPage() {
  // Real contact form (name/email/company/message) + /api/contact + Mailtrap
  // wiring lands in Round 5.
  return (
    <ComingSoon
      title="Get in touch"
      description="We're wiring up the contact form right now. For now, email val@bell.qa directly and we'll respond within a day."
    />
  );
}
