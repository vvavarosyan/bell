import type { Metadata } from 'next';
import Link from 'next/link';
import { DocPage } from '@/components/doc-page';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description:
    'Bell.qa uses essential cookies only — no advertising or cross-site tracking. Here is exactly what is set and why.',
  alternates: { canonical: '/cookie-policy' },
};

export default function CookiePolicyPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Cookie Policy"
      updated="2 July 2026"
      intro="Short version: Bell.qa sets essential cookies only. No advertising cookies, no cross-site tracking, no selling of browsing data — on any Bell surface."
    >
      <h2>1. What cookies are</h2>
      <p>
        Cookies are small text files a site stores in your browser so it can
        remember you between pages and visits. Related technologies (like{' '}
        <code>localStorage</code>) store data in your browser without sending it
        to a server on every request.
      </p>

      <h2>2. What Bell sets</h2>
      <table>
        <thead>
          <tr>
            <th>Name / kind</th>
            <th>Purpose</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>__session</code>, <code>__client_uat</code> (authentication)</td>
            <td>
              Keep you signed in across bell.qa, app.bell.qa, and 0risk.bell.qa.
              Set by our authentication provider on the <code>.bell.qa</code> domain.
            </td>
            <td>Essential</td>
          </tr>
          <tr>
            <td>Stripe cookies (checkout and billing pages only)</td>
            <td>Payment security and fraud prevention during checkout.</td>
            <td>Essential</td>
          </tr>
          <tr>
            <td><code>localStorage</code> preferences</td>
            <td>
              Remember interface choices (filters, layout, an in-progress 0 Risk
              sign-up intent). Never used to track you across sites.
            </td>
            <td>Functional</td>
          </tr>
        </tbody>
      </table>
      <p>
        The interactive map on some pages loads from Mapbox; map tiles are
        fetched anonymously and Bell does not pass your identity to Mapbox.
      </p>

      <h2>3. What Bell does NOT use</h2>
      <ul>
        <li>No advertising or retargeting cookies.</li>
        <li>No third-party analytics trackers that follow you across the web.</li>
        <li>No sale or sharing of browsing behaviour.</li>
      </ul>

      <h2>4. Managing cookies</h2>
      <p>
        Because everything we set is essential or functional, there is no consent
        banner to click through. You can clear or block cookies in your browser
        settings at any time — signing in will stop working until essential
        cookies are allowed again.
      </p>

      <h2>5. Changes and contact</h2>
      <p>
        If we ever add a non-essential cookie, this page will say so first and
        consent will be requested where the law requires. Questions:{' '}
        <a href="mailto:legal@bell.qa">legal@bell.qa</a> · See also the{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </DocPage>
  );
}
