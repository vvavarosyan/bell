// ── Email outcome ────────────────────────────────────────────────────────────
// Val, 2026-08-06: "Emails that have been sent but haven't reached — bounced or a wrong email —
// have a grey arrow. We need to make it obvious it didn't reach; it should be RED."
// He was right, and it was worse than one colour: crm_emails records SEVEN outcomes (migration
// 093) and the old nested ternary named THREE. bounced, complained, delivered and queued all
// fell through to the same dim grey "↗", so a bounce and a successful delivery looked identical.
//
// RULE 2.1 APPLIES TO THE UI. 'sent' means Bell handed the message to the provider and has had
// no confirmation yet — that is NOT delivery, so it stays neutral. Painting it green would claim
// something Bell does not know. Only a status the provider actually reported gets a colour.
// (Val approved this reading 2026-08-06: "yes, I do like your recommendation.")
//
// Colour is never the only signal: every row also carries a short word, because colour alone is
// exactly how this stayed invisible for months and it fails for colour-blind users entirely.
export const EMAIL_OUTCOME = {
  bounced:    { glyph: '⚠', tone: 'bad',     label: "Didn't reach",  title: 'Bounced — the address rejected it' },
  complained: { glyph: '⚠', tone: 'bad',     label: 'Spam report',   title: 'The recipient marked it as spam' },
  failed:     { glyph: '✕', tone: 'bad',     label: 'Not sent',      title: 'Bell could not send it' },
  opened:     { glyph: '✓', tone: 'good',    label: 'Opened',        title: 'Delivered and opened' },
  delivered:  { glyph: '✓', tone: 'good',    label: 'Delivered',     title: 'The mail server accepted it' },
  queued:     { glyph: '◷', tone: 'waiting', label: 'Queued',        title: 'Not sent yet' },
  sent:       { glyph: '↗', tone: 'neutral', label: 'Sent',          title: 'Sent — delivery not confirmed yet' },
};
export const OUTCOME_COLOR = {
  bad:     'rgb(232 142 168)',
  good:    'rgb(111 207 151)',
  waiting: 'rgb(226 189 120)',
  neutral: 'var(--text-dim)',
};
/** Never invent an outcome: an unrecognised status shows neutrally with its own word. */
export function emailOutcome(e) {
  if (e.direction === 'in') {
    return { glyph: '↙', tone: 'info', label: 'Reply', title: 'Reply received', color: 'rgb(91 140 255)' };
  }
  const m = EMAIL_OUTCOME[e.status] || { glyph: '↗', tone: 'neutral', label: e.status || 'Unknown', title: 'Status: ' + (e.status || 'unknown') };
  return { ...m, color: OUTCOME_COLOR[m.tone] || 'var(--text-dim)' };
}
