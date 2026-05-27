import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Knowledge Base',
  description: 'Guides, how-tos, and best practices for working with Bell.qa.',
};

export default function KnowledgeBasePage() {
  return (
    <ComingSoon
      title="Knowledge Base"
      description="Guides and how-tos for getting the most out of Bell.qa. The first articles are in draft."
    />
  );
}
