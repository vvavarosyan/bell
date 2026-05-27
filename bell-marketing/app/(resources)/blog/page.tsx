import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Insights, market commentary, and updates from the Bell.qa team.',
};

export default function BlogPage() {
  return (
    <ComingSoon
      title="Blog"
      description="Market commentary, product updates, and deep dives on the Qatari economy. Our first posts are in draft."
    />
  );
}
