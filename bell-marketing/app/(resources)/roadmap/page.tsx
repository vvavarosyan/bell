import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Roadmap',
  description: 'What we\'re shipping next on Bell.qa.',
};

export default function RoadmapPage() {
  return (
    <ComingSoon
      title="Roadmap"
      description="What we're working on, what's shipping next, and what's in the pipeline. Soon."
    />
  );
}
