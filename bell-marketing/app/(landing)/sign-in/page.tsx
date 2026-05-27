import { redirect } from 'next/navigation';

// /sign-in — the marketing site doesn't host the auth UI. The actual
// sign-in page lives at app.bell.qa/sign-in (Clerk). Visitors get bounced
// there immediately. Done as a server-side 307 redirect so search engines
// don't index this URL and the redirect is fast.
export const metadata = {
  title: 'Sign In',
  robots: { index: false, follow: false },
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bell.qa';

export default function SignInPage() {
  redirect(`${APP_URL}/sign-in`);
}
