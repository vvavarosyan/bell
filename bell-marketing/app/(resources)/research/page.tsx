import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Research',
  description: 'Original market research and intelligence reports on Qatar\'s economy.',
};

export default function ResearchPage() {
  return (
    <ComingSoon
      title="Research"
      description="Original market reports built on the Bell.qa dataset. Industry breakdowns, hiring trends, ownership maps, and more."
    />
  );
}
