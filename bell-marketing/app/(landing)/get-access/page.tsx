import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Get Access',
  description: 'Request access to Bell.qa — the intelligence layer for Qatar.',
  robots: { index: false, follow: true },     // placeholder, don't index yet
};

/**
 * /get-access — placeholder until the user portal registration flow ships
 * at app.bell.qa/sign-up. Once that exists, replace this page's body with
 * a redirect (or update HEADER_CTAS.getAccess.href in content/navigation.ts
 * to the external app.bell.qa URL).
 */
export default function GetAccessPage() {
  return (
    <div className="max-w-prose-narrow mx-auto px-6 py-32 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-bg-elev-2 border border-border text-text-muted text-xs font-medium uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        Registration launching soon
      </div>
      <h1 className="text-display-md text-gradient mb-4">Get access to Bell.qa</h1>
      <p className="text-text-muted text-lg leading-relaxed mb-8">
        The Bell.qa user portal is launching shortly at <span className="text-text font-medium">app.bell.qa</span>.
        Until then, request access through our contact form and we&apos;ll be in
        touch the moment your account is ready.
      </p>
      <Link
        href="/contact"
        className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md bg-accent text-white hover:brightness-110 transition shadow-lg shadow-accent/30"
      >
        Request access
      </Link>
    </div>
  );
}
