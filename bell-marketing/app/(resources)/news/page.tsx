import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'News',
  description: 'Press releases, announcements, and milestones from Bell.qa.',
};

export default function NewsPage() {
  return (
    <ComingSoon
      title="News"
      description="Press releases, product milestones, and announcements from the Bell.qa team."
    />
  );
}
