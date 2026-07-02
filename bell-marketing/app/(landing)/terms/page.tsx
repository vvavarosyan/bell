import type { Metadata } from 'next';
import Link from 'next/link';
import { DocPage } from '@/components/doc-page';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms that govern use of the Bell Data Intelligence platform — accounts, subscriptions, credits, acceptable use, contributed data, and the 0 Risk programme.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Terms of Service"
      updated="2 July 2026"
      notice={
        <>
          <strong>Draft pending counsel.</strong> These terms describe how Bell.qa
          actually works today. Items in [brackets] are being finalized with
          Qatari legal counsel.
        </>
      }
      intro="These Terms of Service (“Terms”) are an agreement between Bell Data Intelligence [legal entity to be inserted by counsel], Doha, State of Qatar (“Bell”) and the organization that opens a workspace (“Customer”, “you”). By creating an account or using bell.qa, app.bell.qa, or 0risk.bell.qa you accept these Terms."
    >
      <h2>1. The service</h2>
      <p>
        Bell provides a business-intelligence platform covering the Qatari
        economy: a searchable directory of companies, professionals, and jobs;
        signals and analytics; maps; a built-in CRM; research tools; and related
        features. The platform evolves continuously; features may be added,
        changed, or retired.
      </p>

      <h2>2. Accounts and workspaces</h2>
      <ul>
        <li>You must provide accurate registration information and keep credentials secure. You are responsible for activity in your workspace.</li>
        <li>Workspace owners may invite team members and control their roles; the Customer remains responsible for its members&apos; use.</li>
        <li>Bell may suspend accounts that present a security risk, are delinquent on payment, or breach these Terms.</li>
      </ul>

      <h2>3. Subscriptions, credits, and billing</h2>
      <ul>
        <li>Paid plans are billed in Qatari Riyal (QAR) through our payment processor. Bell has no free tier.</li>
        <li>Plans include monthly <strong>credits</strong> used to reveal contact details and run certain features. Credits have no cash value and expire when the subscription ends.</li>
        <li>Subscriptions renew automatically until cancelled. If a renewal payment fails, access may be frozen after a short grace period until payment is restored.</li>
        <li>Fees are non-refundable except where the law requires otherwise. Upgrades take effect immediately; downgrades at the next renewal.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree NOT to:</p>
      <ul>
        <li>scrape, crawl, bulk-download, or systematically extract the directory beyond the export limits built into the product;</li>
        <li>resell, sublicense, or redistribute Bell data as a dataset, or use it to build a competing database;</li>
        <li>use revealed contact details in violation of applicable law — including Qatar&apos;s PDPPL and anti-spam rules. <strong>For your own outreach you are the data controller</strong> and responsible for lawful basis, content, and opt-outs;</li>
        <li>probe, disrupt, or overload the service, or attempt to access another customer&apos;s workspace;</li>
        <li>upload unlawful content or content you have no right to share.</li>
      </ul>

      <h2>5. Your workspace content</h2>
      <p>
        CRM records, notes, files, and imports you create remain{' '}
        <strong>yours</strong>. Bell processes them only to operate the service,
        keeps them isolated to your workspace, and does not show them to other
        customers.
      </p>

      <h2>6. Contributed data — improving the shared directory</h2>
      <p>
        Bell gets better as customers use it. When you add business information to
        Bell — for example new companies, corrected phone numbers, websites, or
        imported business lists — you:
      </p>
      <ul>
        <li>
          <strong>grant Bell a non-exclusive, perpetual, royalty-free licence</strong>{' '}
          to review that business information and, after human curation, incorporate
          it into Bell&apos;s directory for the benefit of all customers;
        </li>
        <li>
          <strong>warrant</strong> that you may lawfully share it and that it does
          not breach any confidentiality obligation;
        </li>
        <li>
          understand that <strong>nothing is published automatically</strong>: every
          contribution passes Bell&apos;s review pipeline first, contributions about
          identifiable individuals are held to a stricter, lawyer-gated standard
          [counsel: final wording], and your own workspace copy is unaffected
          either way.
        </li>
      </ul>

      <h2>7. The 0 Risk programme</h2>
      <p>
        The 0 Risk revenue-share programme (0risk.bell.qa) is governed by a
        separate signed and stamped agreement between Bell and the participating
        company, including the revenue-share percentage, reporting duties, and
        enforcement. These Terms apply to use of the 0 Risk portal itself; where
        the signed agreement and these Terms conflict, the signed agreement
        prevails for that programme.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        Bell owns the platform, software, brand, and the compilation and
        enrichment of the directory (database rights). You receive a limited,
        non-exclusive, non-transferable licence to use the service for your
        internal business purposes during your subscription. Feedback you give us
        may be used to improve the product.
      </p>

      <h2>9. Data protection</h2>
      <p>
        Each party complies with Qatar Law No. (13) of 2016 (PDPPL) in its role.
        Bell&apos;s processing is described in the{' '}
        <Link href="/privacy">Privacy Policy</Link>. For personal data you load
        into your workspace, you are the controller and Bell processes it on your
        instructions. [Counsel: confirm controller/processor allocation.]
      </p>

      <h2>10. Confidentiality</h2>
      <p>
        Each party protects the other&apos;s non-public information with at least
        reasonable care and uses it only to perform under these Terms.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        Bell works hard to keep the directory accurate — sources are official,
        provenance is tracked, records refresh continuously — but data is provided{' '}
        <strong>“as is”</strong>. Bell does not warrant that any record is
        complete, current, or fit for a particular decision, and Bell is not a
        credit bureau, rating agency, or a source of legal, financial, or
        investment advice.
      </p>

      <h2>12. Liability</h2>
      <p>
        To the maximum extent permitted by law, neither party is liable for
        indirect or consequential loss, and Bell&apos;s total liability under these
        Terms is capped at the fees you paid in the twelve (12) months before the
        claim. Nothing limits liability that cannot lawfully be limited.
        [Counsel: confirm cap and carve-outs.]
      </p>

      <h2>13. Term, suspension, and exit</h2>
      <ul>
        <li>These Terms apply while you have an account.</li>
        <li>You may cancel any time; access continues to the end of the paid period.</li>
        <li>Bell may suspend or terminate for material breach, unlawful use, or non-payment.</li>
        <li>On exit you may export your CRM data using the built-in export; after a reasonable window Bell deletes workspace content per the Privacy Policy.</li>
      </ul>

      <h2>14. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Qatar, and the
        competent courts of Qatar have exclusive jurisdiction. [Counsel: confirm
        forum choice.]
      </p>

      <h2>15. Changes</h2>
      <p>
        We may update these Terms as the product evolves. Material changes will be
        announced in-app or by email with reasonable notice; continued use after
        the effective date is acceptance.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:legal@bell.qa">legal@bell.qa</a>.
      </p>
    </DocPage>
  );
}
