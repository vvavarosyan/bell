import type { Metadata } from 'next';
import { BuyerIntentPageSections } from '@/components/buyer-intent-page-sections';

export const metadata: Metadata = {
  title: 'Buyer Intent — Bell.qa',
  description:
    'Intent, recognized and surfaced on the records that matter. Bell watches every Qatari company and person for buying signals — tech stack changes, hiring, news, regulatory activity — and marks the records you should reach out to. Personalized per user.',
};

export default function BuyerIntentPage() {
  return <BuyerIntentPageSections />;
}
