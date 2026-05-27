import type { Metadata } from 'next';
import { TeamPageSections } from '@/components/team-page-sections';

export const metadata: Metadata = {
  title: 'Team — Bell.qa',
  description:
    'One workspace, every team. Members, roles, and handoffs across Sales, Marketing, BD, Research, and GTM — all on the Bell.qa graph.',
};

export default function TeamPage() {
  return <TeamPageSections />;
}
