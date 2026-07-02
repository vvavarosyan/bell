import type { Metadata } from 'next';
import Link from 'next/link';
import { DocPage } from '@/components/doc-page';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Bell Data Intelligence collects, uses, protects, and removes data — including your rights under Qatar\'s Personal Data Privacy Protection Law (PDPPL).',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Privacy Policy"
      updated="2 July 2026"
      notice={
        <>
          <strong>Draft pending counsel.</strong> This policy describes how Bell.qa
          actually operates today. Items in [brackets] are being finalized with
          Qatari legal counsel and may be refined; the operational commitments —
          including data removal — already apply.
        </>
      }
      intro="Bell Data Intelligence (“Bell”, “Bell.qa”, “we”) is a business-intelligence platform focused on the Qatari economy. This policy explains what data we process, why, on what basis, and the rights you have — whether you are a Bell customer or a person who appears in our business directory."
    >
      <h2>1. Who we are</h2>
      <p>
        Bell Data Intelligence [legal entity name and CR number to be inserted by
        counsel], Doha, State of Qatar, operates bell.qa, app.bell.qa, admin.bell.qa
        and 0risk.bell.qa. For anything in this policy, contact{' '}
        <a href="mailto:legal@bell.qa">legal@bell.qa</a>.
      </p>

      <h2>2. The two kinds of data we handle</h2>
      <p>
        Bell processes two clearly separated categories, and this policy treats
        them separately:
      </p>
      <ul>
        <li>
          <strong>Directory data</strong> — information about Qatari companies and
          the professionals who run them: registrations, licences, addresses,
          websites, business contact details, roles, and public market signals.
          This is the product itself.
        </li>
        <li>
          <strong>Customer data</strong> — information about the people and
          organizations who use Bell: account details, billing, workspace content
          (such as CRM records and notes), and usage of the platform.
        </li>
      </ul>

      <h2>3. Directory data — what and where from</h2>
      <p>
        Directory records are compiled by Bell&apos;s own collection software from
        official and public sources, including the Ministry of Commerce and
        Industry, the Qatar Financial Centre public register, sector regulators,
        official gazettes and tender platforms, company websites, press archives,
        and professional networks used as a leadership-graph source. Every
        datapoint carries provenance — we can tell you where a fact came from.
      </p>
      <p>
        Directory data is <strong>business-context data</strong>: company facts,
        professional roles, and work contact details. We do not build consumer
        profiles, and we do not process special-category data (health, beliefs,
        biometrics) in the directory.
      </p>

      <h2>4. If you appear in the directory — your rights</h2>
      <p>
        If you are a business owner, executive, or professional listed in Bell, you
        can at any time:
      </p>
      <ul>
        <li><strong>Request a copy</strong> of the information we hold about you;</li>
        <li><strong>Request correction</strong> of inaccurate information;</li>
        <li>
          <strong>Request removal.</strong> We honour removal requests within{' '}
          <strong>14 days</strong> — see our <Link href="/data/trust">Trust page</Link>{' '}
          (“Built in Qatar. Yours to remove.”). Removal covers the platform and
          propagates to our customers&apos; future exports.
        </li>
      </ul>
      <p>
        Send requests to <a href="mailto:legal@bell.qa">legal@bell.qa</a> with
        enough detail to identify the record. We may verify you are the person
        concerned (or authorised to act for them) before acting.
      </p>
      <p>
        [Counsel: confirm the articulation of the lawful basis for processing
        business-contact data under Law No. (13) of 2016 (PDPPL) and any required
        regulator notifications.]
      </p>

      <h2>5. Customer data — what we collect</h2>
      <ul>
        <li><strong>Account:</strong> name, work email, company, role, and sign-in identifiers (managed by our authentication provider).</li>
        <li><strong>Billing:</strong> plan, invoices, and payment status. Card details are handled by our payment processor and never touch Bell&apos;s servers.</li>
        <li><strong>Workspace content:</strong> your CRM records, notes, imports, saved searches, and settings. This content is yours; it is isolated per workspace and never appears in the public directory unless it passes our review pipeline (see §6).</li>
        <li><strong>Usage:</strong> feature activity, reveal/credit history, and technical logs used for security and reliability.</li>
        <li><strong>Communications:</strong> messages you send us and your notification preferences.</li>
      </ul>

      <h2>6. Contributed data</h2>
      <p>
        Customers can add datapoints, records, and imports to their private
        workspace. As described in our <Link href="/terms">Terms of Service</Link>,
        contributed <strong>business</strong> information may be reviewed by Bell&apos;s
        curation team and, only after human review, used to improve the shared
        directory. Contributions concerning identifiable individuals are held to a
        stricter standard and are not published without a lawful basis
        [counsel: final wording].
      </p>

      <h2>7. Service providers</h2>
      <p>
        We use a small set of processors to run Bell: cloud hosting (Railway),
        authentication (Clerk), payments (Stripe), transactional email (Resend),
        and maps (Mapbox). Each processes data only on our instructions.
        [Counsel: confirm the disclosed subprocessor list and transfer wording.]
      </p>

      <h2>8. International transfers</h2>
      <p>
        Bell is built for Qatar, and sovereign deployments keep data on Qatari
        soil. Our standard cloud infrastructure may process data in other
        jurisdictions with appropriate safeguards. [Counsel: PDPPL transfer
        conditions.]
      </p>

      <h2>9. Security</h2>
      <p>
        Access to production systems is restricted and authenticated; workspaces
        are isolated per tenant; contact details are masked until explicitly
        revealed by a customer; and documents uploaded for the 0 Risk programme
        are visible only to Bell&apos;s administrators for verification.
      </p>

      <h2>10. Retention</h2>
      <ul>
        <li>Directory data: retained while it remains accurate and publicly relevant; removed on request (§4) or when a record is verifiably obsolete.</li>
        <li>Customer account and workspace data: retained for the life of the subscription and deleted or returned on written request after termination, except what we must keep for legal, billing, or audit reasons.</li>
        <li>Logs: kept for a limited operational window.</li>
      </ul>

      <h2>11. Cookies</h2>
      <p>
        Bell uses essential cookies only — see the{' '}
        <Link href="/cookie-policy">Cookie Policy</Link>.
      </p>

      <h2>12. Children</h2>
      <p>
        Bell is a business tool. It is not directed at children, and we do not
        knowingly process children&apos;s data.
      </p>

      <h2>13. Changes</h2>
      <p>
        We will post any material change here and update the date above. If a
        change meaningfully affects your rights, we will notify customers in-app
        or by email.
      </p>

      <h2>14. Contact</h2>
      <p>
        Privacy questions, access, correction, or removal requests:{' '}
        <a href="mailto:legal@bell.qa">legal@bell.qa</a>. General support:{' '}
        <a href="mailto:support@bell.qa">support@bell.qa</a> or{' '}
        <Link href="/support">bell.qa/support</Link>.
      </p>
    </DocPage>
  );
}
