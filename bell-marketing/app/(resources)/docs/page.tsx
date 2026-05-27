import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Guides, API reference, and tutorials for working with Bell.qa.',
};

export default function DocsPage() {
  return (
    <ComingSoon
      title="Documentation"
      description="Guides, API reference, and tutorials are being written. Sign up to know when they launch."
    />
  );
}
