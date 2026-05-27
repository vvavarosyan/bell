import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Bell.qa AI Information',
  description: 'How Bell.qa uses AI in its products, what data trains models, and how to opt out.',
};

export default function AiInformationPage() {
  return (
    <ComingSoon
      title="Bell.qa AI Information"
      description="A transparent explanation of how AI is used across Bell.qa — what's automated, what data trains the models, and how to opt out. Publishing alongside the platform launch."
    />
  );
}
