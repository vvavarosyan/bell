'use client';

import { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';

/** Contact form → /api/contact (same-origin proxy) → Bell's inbox, Reply-To the visitor. */
export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'busy') return;
    setState('busy');
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), company: company.trim(), message: message.trim() }),
      });
      if (res.ok) setState('done');
      else {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === 'invalid_email' ? 'That email address doesn’t look right.'
          : data.error === 'missing_fields' ? 'Please add your name and a message.'
          : data.error === 'too_many_requests' ? 'Too many messages — please try again in an hour.'
          : 'Something went wrong — please try again in a minute.');
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
        <p className="text-lg font-medium mb-1">Message sent.</p>
        <p className="text-text-muted text-sm">Thanks, {name.trim() || 'there'} — we read every message and usually reply within a day.</p>
      </div>
    );
  }

  const input = 'w-full mb-4 px-3.5 py-2.5 rounded-md bg-bg border border-border text-sm focus:outline-none focus:border-accent';
  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-bg-elev-2 p-8">
      <label className="block text-sm font-medium mb-1.5" htmlFor="ct-name">Name</label>
      <input id="ct-name" required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className={input} />
      <label className="block text-sm font-medium mb-1.5" htmlFor="ct-email">Work email</label>
      <input id="ct-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.qa" className={input} />
      <label className="block text-sm font-medium mb-1.5" htmlFor="ct-company">Company <span className="text-text-muted font-normal">(optional)</span></label>
      <input id="ct-company" value={company} onChange={e => setCompany(e.target.value)} placeholder="Your company" className={input} />
      <label className="block text-sm font-medium mb-1.5" htmlFor="ct-message">Message</label>
      <textarea id="ct-message" required rows={5} value={message} onChange={e => setMessage(e.target.value)}
        placeholder="Access, partnerships, data questions, feedback — anything." className={input} />
      <button type="submit" disabled={state === 'busy'}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition disabled:opacity-60">
        <Send size={15} />
        {state === 'busy' ? 'Sending…' : 'Send message'}
      </button>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
    </form>
  );
}
