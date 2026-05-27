import type { Metadata } from 'next';
import { ResearchPageSections } from '@/components/research-page-sections';

export const metadata: Metadata = {
  title: 'Research — Bell.qa',
  description:
    'On-demand deep research, structured and cited. Companies, people, sectors, themes, regions, regulations — anything in the Qatari market, researched at depth, with provenance.',
};

export default function ResearchPage() {
  return <ResearchPageSections />;
}
