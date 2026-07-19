'use client';

import { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';

/**
 * Market-updates opt-in form. Posts to /api/optin (a same-origin proxy → the app's consent
 * API), which records the subscription in Bell's consent ledger. The wording below IS the
 * consent wording stored with the record — keep them in sync deliberately.
 */
export function OptInForm() {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'busy') return;
    setState('busy');
    setError('');
    try {
      const res = await fetch('/api/optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), company: company.trim() }),
      });
      if (res.ok) setState('done');
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error === 'invalid_email' ? 'That email address doesn’t look right.' : 'Something went wrong — please try again in a minute.');
        setState('error');
      }
    } catch {
      setError('Something went wrong — please try again in a minute.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div className="rounded-lg border border-border bg-bg-elev-2 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 text-accent" size={28} />
        <p className="text-lg font-medium mb-1">You&rsquo;re on the list.</p>
        <p className="text-text-muted text-sm">
          We&rsquo;ll email you Qatar tenders and market signals worth knowing about. Every email
          has a one-click unsubscribe.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-bg-elev-2 p-8">
      <label className="block text-sm font-medium mb-1.5" htmlFor="optin-email">Work email</label>
      <input
        id="optin-email"
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@company.qa"
        className="w-full mb-4 px-3.5 py-2.5 rounded-md bg-bg border border-border text-sm focus:outline-none focus:border-accent"
      />
      <label className="block text-sm font-medium mb-1.5" htmlFor="optin-company">Company <span className="text-text-muted font-normal">(optional)</span></label>
      <input
        id="optin-company"
        type="text"
        value={company}
        onChange={e => setCompany(e.target.value)}
        placeholder="Your company name"
        className="w-full mb-5 px-3.5 py-2.5 rounded-md bg-bg border border-border text-sm focus:outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={state === 'busy'}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition disabled:opacity-60"
      >
        <Mail size={15} />
        {state === 'busy' ? 'Signing you up…' : 'Get market updates'}
      </button>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <p className="mt-4 text-xs text-text-muted leading-relaxed">
        By signing up you agree that Bell (bell.qa) may email you about Qatar business
        intelligence, tenders and market signals. You can unsubscribe at any time — every
        email includes a one-click unsubscribe link.
      </p>
    </form>
  );
}
