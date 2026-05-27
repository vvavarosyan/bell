import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to the Bell.qa user portal.',
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  // The actual user portal lives at app.bell.qa (future). This page is the
  // marketing-site placeholder so the header's Sign In CTA always lands
  // somewhere useful until that subdomain is live.
  return (
    <ComingSoon
      title="Sign In coming soon"
      description="The Bell.qa user portal is launching shortly at app.bell.qa. Until then, request access and we'll be in touch as soon as your account is ready."
    />
  );
}
