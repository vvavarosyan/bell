// PEOPLE PUBLIC LOCKDOWN banner (Val 2026-07-02, wording approved same day).
// Shown to CUSTOMERS wherever individual-person data would appear — the People
// section and the company drawer's People tab — while person-level data stays
// admin-only under Qatar's personal-data rules. Counts remain visible so the
// user sees the depth that's waiting; the data itself stays locked.
import { html } from '../lib/html.js';
import { navigateTo } from '../lib/router.js';

export function PeopleLockedBanner({ count = null, compact = false }) {
  return html`
    <div style=${{
      maxWidth: compact ? '100%' : '640px',
      margin: compact ? '14px 0' : '48px auto',
      border: '1px solid var(--border)',
      background: 'var(--bg-elev)',
      borderRadius: '12px',
      padding: compact ? '18px 20px' : '28px 30px',
      textAlign: compact ? 'left' : 'center',
    }}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: compact ? 'flex-start' : 'center', marginBottom: '10px' }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-bright, #a5c3ff)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span style=${{ fontSize: compact ? '13.5px' : '15px', fontWeight: 700, color: 'var(--text)' }}>
          Individual profiles are temporarily unavailable
        </span>
      </div>
      ${count != null ? html`
        <div style=${{ fontSize: compact ? '12px' : '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          <b style=${{ color: 'var(--text)', fontSize: compact ? '14px' : '17px' }}>${Number(count).toLocaleString()}</b>
          ${compact ? ' people are mapped at this company.' : ' people are mapped in Bell’s graph.'}
        </div>` : null}
      <p style=${{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
        Individual decision-maker profiles are temporarily unavailable while we
        finalize the framework for personal-data access under Qatar’s privacy
        regulations. Every company’s full business profile remains available —
        and we’re working to unlock this section as soon as possible.
      </p>
      ${!compact ? html`
        <button class="sys-btn" onClick=${() => navigateTo('companies')}>Browse Companies</button>` : null}
    </div>
  `;
}
