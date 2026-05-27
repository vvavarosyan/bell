import type { Metadata } from 'next';
import { BellaPageSections } from '@/components/bella-page-sections';

export const metadata: Metadata = {
  title: 'Bella — Bell.qa',
  description:
    'Bella is the AI operator inside Bell.qa. She answers, navigates, explains, and operates across every part of the platform — with you in control.',
};

export default function BellaPage() {
  return <BellaPageSections />;
}
