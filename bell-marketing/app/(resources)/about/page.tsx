import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'The mission and team behind Bell.qa.',
};

export default function AboutPage() {
  return (
    <ComingSoon
      title="About Us"
      description="The story of why Bell.qa exists and who's building it. Coming soon."
    />
  );
}
