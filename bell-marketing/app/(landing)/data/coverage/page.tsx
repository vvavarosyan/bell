import type { Metadata } from 'next';
import { CoveragePageSections } from '@/components/coverage-page-sections';

export const metadata: Metadata = {
  title: 'Coverage — Bell.qa Data',
  description:
    'The country, recorded. Companies, people, jobs, signals, regulations, ownership, sectors, tenders, news, air & road traffic, weather, geo data, government data — every observable surface of Qatar, captured as structured records on the Bell.qa graph.',
};

export default function CoveragePage() {
  return <CoveragePageSections />;
}
