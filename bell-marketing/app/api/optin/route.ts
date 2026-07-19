import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for the opt-in form → the app's consent API. Proxying (instead of posting
// cross-origin from the browser) avoids CORS entirely and keeps the app endpoint's own
// rate-limiting as the single guard. Records consent (basis: web_form) in Bell's append-only
// ledger — the lawful-growth path for outreach.
const APP_API = process.env.BELL_APP_API || 'https://app.bell.qa';

export async function POST(req: NextRequest) {
  let body: { email?: string; company?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const email = String(body.email ?? '').trim();
  if (!email || email.length > 254) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  try {
    const upstream = await fetch(APP_API + '/api/marketing-optin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the real visitor IP so the consent evidence + rate limiting see it.
        'X-Forwarded-For': req.headers.get('x-forwarded-for') ?? '',
        'User-Agent': req.headers.get('user-agent') ?? '',
      },
      body: JSON.stringify({ email, company: String(body.company ?? '').slice(0, 200) }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
