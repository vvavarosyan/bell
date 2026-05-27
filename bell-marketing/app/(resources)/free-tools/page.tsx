import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Free Tools',
  description: 'Free utilities powered by the Bell.qa dataset — company lookup, market reports, and more.',
};

export default function FreeToolsPage() {
  return (
    <ComingSoon
      title="Free Tools"
      description="Lightweight utilities anyone can use — free Qatar company lookup, industry breakdown reports, economy snapshots. Tools land here as they ship."
    />
  );
}
