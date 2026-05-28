import type { Metadata } from 'next';
import { LivePageSections } from '@/components/live-page-sections';

export const metadata: Metadata = {
  title: 'Live — Bell.qa Data',
  description:
    'The country, alive. Every record on the Bell.qa graph is polled continuously, every change is detected and timestamped, every fact carries its own freshness — from the 60-second air-traffic ping to the weekly sector report.',
};

export default function LivePage() {
  return <LivePageSections />;
}
