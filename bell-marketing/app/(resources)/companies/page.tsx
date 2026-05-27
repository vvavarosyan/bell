import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Companies',
  description: 'Public preview of every verified Qatari company in Bell.qa.',
};

export default function CompaniesPage() {
  return (
    <ComingSoon
      title="Companies"
      description="A searchable public index of every verified Qatari company we track. Coming with the full dataset launch."
    />
  );
}
