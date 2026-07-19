import type { Metadata } from 'next';
import { OptInForm } from '@/components/optin-form';

export const metadata: Metadata = {
  title: 'Qatar Market Updates — Bell.qa',
  description:
    'Get Qatar tenders, buyer signals and market intelligence by email. Curated from the Bell.qa graph — government tenders the moment they publish, company signals, and market movements.',
};

export default function MarketUpdatesPage() {
  return (
    <div className="max-w-prose-narrow mx-auto px-6 py-24">
      <h1 className="text-display-md text-gradient mb-4 text-center">Qatar market updates, by email</h1>
      <p className="text-text-muted text-lg leading-relaxed mb-10 text-center">
        Government tenders the moment they publish. Companies scaling, hiring, and buying.
        The market movements that matter — curated from the Bell.qa graph, sent when there&rsquo;s
        something worth knowing.
      </p>
      <OptInForm />
      <p className="mt-8 text-sm text-text-muted text-center">
        Want the full platform — live tenders, 190k+ companies, signals and CRM?{' '}
        <a href="/get-access" className="text-accent hover:underline">Get access to Bell</a>.
      </p>
    </div>
  );
}
