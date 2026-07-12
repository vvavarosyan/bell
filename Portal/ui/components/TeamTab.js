// TEAM (Phase 5) — invite teammates into your workspace and manage their roles.
// Any member sees the roster; owners/admins can invite, change roles, and remove
// people. Membership is server-enforced (users.tenant_id + role); an invited
// person joins THIS workspace when they sign up with the invited email.
//
// All hooks live above the single return (page-blank rule).

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', lead: 'Lead', member: 'Member', viewer: 'Viewer', platform_admin: 'Staff' };
const ROLE_HINT = {
  admin: 'Manage the team + full access',
  lead: 'Full access, plus lead the team’s work',
  member: 'Full access to work the platform',
  viewer: 'Read-only — can look, not change',
};
const ROLE_COLOR = { owner: '#f5c84c', admin: '#5b8cff', lead: '#a855f7', member: '#6fcf97', viewer: '#9ca5b9', platform_admin: '#e88ea8' };

const ERRS = {
  already_member: 'That person is already on your team.',
  bad_email: 'Enter a valid email address.',
  bad_role: 'Pick a valid role.',
  cannot_remove_owner: 'You can’t remove the owner.',
  cannot_change_owner: 'You can’t change the owner’s role.',
  cannot_remove_self: 'You can’t remove yourself.',
  cannot_change_self: 'You can’t change your own role.',
  forbidden: 'Only owners and admins can manage the team.',
};
const friendly = (e) => ERRS[e?.message] || e?.message || 'Something went wrong.';

function RoleBadge({ role }) {
  const c = ROLE_COLOR[role] || '#9ca5b9';
  return html`<span style=${{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: c, background: c + '1f', border: '1px solid ' + c + '55', borderRadius: '999px', padding: '2px 9px', whiteSpace: 'nowrap' }}>${ROLE_LABEL[role] || role}</span>`;
}

const fmtDate = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

export function TeamTab() {
  const [data, setData] = useState(null);        // { members, can_manage, your_role, invitable_roles }
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = await api.teamMembers();
      setData(m);
      if (m.can_manage) { try { const iv = await api.teamInvites(); setInvites(iv.invites || []); } catch { setInvites([]); } }
    } catch { setData({ members: [], can_manage: false, invitable_roles: [] }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    const e = email.trim();
    if (!e || busy) return;
    setBusy(true);
    try { await api.teamInvite(e, role); toast('Invitation sent to ' + e); setEmail(''); await load(); }
    catch (err) { toast('Invite failed — ' + friendly(err), 'error'); }
    finally { setBusy(false); }
  };
  const revoke = async (id) => { try { await api.teamRevokeInvite(id); await load(); } catch (err) { toast('Failed — ' + friendly(err), 'error'); } };
  const changeRole = async (id, r) => { try { await api.teamSetRole(id, r); await load(); toast('Role updated'); } catch (err) { toast('Failed — ' + friendly(err), 'error'); } };
  const removeMember = async (id, name) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remove ${name} from the team? They’ll lose access to this workspace.`)) return;
    try { await api.teamRemove(id); await load(); toast('Removed'); } catch (err) { toast('Failed — ' + friendly(err), 'error'); }
  };

  const canManage = !!data?.can_manage;
  const invitableRoles = data?.invitable_roles || ['admin', 'lead', 'member', 'viewer'];

  const input = { background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px' };
  const card = { border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '14px 16px', marginBottom: '14px' };

  const body = html`<div style=${{ maxWidth: '760px' }}>
      <div key="hdr" style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0 14px' }}>
        <h2 style=${{ margin: 0, fontSize: '17px' }}>Team</h2>
        <span class="muted small">Invite teammates into your workspace and manage what they can do.</span>
      </div>

      ${loading ? html`<div key="body" class="empty">Loading team…</div>` : html`<div key="body">
        ${canManage ? html`<div key="invite" style=${card}>
            <div style=${{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--text)' }}>Invite a teammate</div>
            <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="email" placeholder="teammate@company.com" value=${email}
                onInput=${(e) => setEmail(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') invite(); }}
                style=${{ ...input, flex: '1 1 240px', minWidth: '180px' }} />
              <select value=${role} onChange=${(e) => setRole(e.target.value)} style=${{ ...input, cursor: 'pointer' }}>
                ${invitableRoles.map((r) => html`<option key=${r} value=${r}>${ROLE_LABEL[r] || r}</option>`)}
              </select>
              <button disabled=${busy || !email.trim()} onClick=${invite}
                style=${{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: busy || !email.trim() ? 'default' : 'pointer', opacity: busy || !email.trim() ? 0.6 : 1 }}>
                ${busy ? 'Sending…' : 'Send invite'}
              </button>
            </div>
            <div class="muted small" style=${{ marginTop: '8px' }}>${ROLE_HINT[role] || ''} · They join by signing up with that email address.</div>
          </div>` : html`<div key="invite" style=${{ ...card, fontSize: '12.5px', color: 'var(--text-muted)' }}>
            Only the workspace owner and admins can invite or manage teammates.
          </div>`}
        ${canManage && invites.length ? html`<div key="pending" style=${card}>
            <div style=${{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--text)' }}>Pending invitations · ${invites.length}</div>
            ${invites.map((iv) => html`<div key=${iv.id} style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style=${{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>${iv.email}</span>
                <${RoleBadge} role=${iv.role} />
                <span class="muted small">expires ${fmtDate(iv.expires_at)}</span>
                <button onClick=${() => revoke(iv.id)} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '4px 10px', fontSize: '11.5px', cursor: 'pointer' }}>Revoke</button>
              </div>`)}
          </div>` : null}
        <div key="members" style=${card}>
          <div key="title" style=${{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--text)' }}>Members · ${(data?.members || []).length}</div>
          ${!(data?.members || []).length ? html`<div key="empty" class="muted small" style=${{ padding: '6px 0' }}>No teammates yet.</div>` : null}
          ${(data?.members || []).length ? (data.members).map((m) => html`<div key=${m.id} style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div key="info" style=${{ flex: 1, minWidth: 0 }}>
                <div style=${{ fontSize: '13.5px', color: 'var(--text)' }}>${m.full_name || m.email}${m.is_you ? html`<span class="muted small"> · you</span>` : null}</div>
                <div class="muted small">${m.email}</div>
              </div>
              ${canManage && m.role !== 'owner' && !m.is_you ? html`<span key="ctrl" style=${{ display: 'contents' }}>
                  <select value=${m.role} onChange=${(e) => changeRole(m.id, e.target.value)} style=${{ ...input, padding: '5px 8px', fontSize: '12px', cursor: 'pointer' }}>
                    ${invitableRoles.map((r) => html`<option key=${r} value=${r}>${ROLE_LABEL[r] || r}</option>`)}
                  </select>
                  <button onClick=${() => removeMember(m.id, m.full_name || m.email)} title="Remove from team"
                    style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red, #e88ea8)', borderRadius: '6px', padding: '5px 10px', fontSize: '11.5px', cursor: 'pointer' }}>Remove</button>
                </span>`
                : html`<${RoleBadge} key="ctrl" role=${m.role} />`}
            </div>`) : null}
        </div>
      </div>`}
    </div>`;

  return html`<div class="page-fill"><div class="page-scroll">${body}</div></div>`;
}
