import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for the contact form → the app's contact API (same pattern as /api/optin:
// no CORS, the app endpoint's rate limiting is the single guard).
const APP_API = process.env.BELL_APP_API || 'https://app.bell.qa';

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; company?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  try {
    const upstream = await fetch(APP_API + '/api/marketing-contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': req.headers.get('x-forwarded-for') ?? '',
        'User-Agent': req.headers.get('user-agent') ?? '',
      },
      body: JSON.stringify({
        name: String(body.name ?? '').slice(0, 120),
        email: String(body.email ?? '').slice(0, 254),
        company: String(body.company ?? '').slice(0, 200),
        message: String(body.message ?? '').slice(0, 5000),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}
