import type { Metadata } from 'next';
import { PipelinePageSections } from '@/components/pipeline-page-sections';

export const metadata: Metadata = {
  title: 'Pipeline — Bell.qa Data',
  description:
    'The machine behind the data. A six-stage proprietary pipeline running continuously on Bell-owned servers in Qatar — ingesting, cleaning, verifying, deduplicating, enriching, and live-tracking every record. End to end, no third-party data licences.',
};

export default function PipelinePage() {
  return <PipelinePageSections />;
}
