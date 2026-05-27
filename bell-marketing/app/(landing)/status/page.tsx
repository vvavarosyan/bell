import type { Metadata } from 'next';
import { StatusSections } from '@/components/status-sections';

export const metadata: Metadata = {
  title: 'System Status',
  description:
    'Live operational status of the Bell.qa platform. Component health, 90-day uptime, incident history, and scheduled maintenance for every system in production.',
};

export default function StatusPage() {
  return <StatusSections />;
}
