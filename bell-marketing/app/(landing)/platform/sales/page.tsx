import type { Metadata } from 'next';
import { SalesPageSections } from '@/components/sales-page-sections';

export const metadata: Metadata = {
  title: 'Sales — Bell.qa',
  description:
    'Bell.qa for sales teams. The full pipeline on the only data Qatar runs on — coverage no one else has, intelligence no one else has, Bella running the engine.',
};

export default function SalesPage() {
  return <SalesPageSections />;
}
