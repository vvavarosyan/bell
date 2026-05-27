import { redirect } from 'next/navigation';

// /get-access — like /sign-in, this is just a redirect to the app subdomain
// where the actual sign-up flow lives (Clerk → Stripe Checkout).
export const metadata = {
  title: 'Get Access',
  robots: { index: false, follow: true },
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bell.qa';

export default function GetAccessPage() {
  redirect(`${APP_URL}/sign-up`);
}
