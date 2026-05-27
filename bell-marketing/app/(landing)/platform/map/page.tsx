import type { Metadata } from 'next';
import { MapPageSections } from '@/components/map-page-sections';

export const metadata: Metadata = {
  title: 'Map — Bell.qa',
  description:
    'The Qatari market, mapped. Every company a node on Doha; every signal a live pulse. The geographic surface of the Bell.qa graph.',
};

export default function MapPage() {
  return <MapPageSections />;
}
