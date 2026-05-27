import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers to the most-asked questions about Bell.qa.',
};

export default function FaqPage() {
  return (
    <ComingSoon
      title="FAQ"
      description="The answers to the questions we hear most often. Being compiled now."
    />
  );
}
