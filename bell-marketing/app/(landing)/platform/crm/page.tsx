import type { Metadata } from 'next';
import { CrmPageSections } from '@/components/crm-page-sections';

export const metadata: Metadata = {
  title: 'CRM — Bell.qa',
  description:
    'The CRM that came pre-loaded with the Qatari market. Accounts, contacts, deals, activity feed — all on the Bell.qa graph, with Bella inside every record.',
};

export default function CrmPage() {
  return <CrmPageSections />;
}
