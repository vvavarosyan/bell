// /api/account — the signed-in user's own profile, notification settings, and
// preferences. Core profile fields live in `users` columns; the richer fields
// (department, bio, booking link, email signature, …) plus notifications and
// preferences live in users.extra_fields so we can extend them freely.

import { Router } from 'express';
import { query } from '../db.js';
import { encryptPII, normalizeId, idLast4, piiConfigured } from '../lib/pii.js';

const router = Router();

// Editable columns on the users table.
const PROFILE_COLS = [
  'full_name', 'first_name', 'last_name', 'avatar_url',
  'title', 'phone', 'linkedin_url', 'location', 'function_team',
];
// Extra profile fields kept in extra_fields.profile.
const EXTRA_PROFILE = [
  'department', 'mobile', 'bio', 'twitter_url', 'website_url',
  'booking_link', 'email_signature',
  // display_name (the name shown on emails) is edited in Settings → Email but
  // was never whitelisted here, so it silently didn't save — fixed 2026-07-12.
  'display_name',
  // Email branding (Val 2026-07-12): a header + footer wrapped around every
  // outgoing email so they don't look plain. HTML, editable here or by Bella.
  'email_header_html', 'email_footer_html',
];

function defaultNotifications() {
  return {
    sequence_replies: true,    // a prospect replied to a sequence
    credit_low:       true,    // credit balance running low
    product_updates:  true,    // Bell product news
    // weekly_digest returns together with the digest feature itself (A4).
  };
}
function defaultPreferences() {
  return { timezone: null, locale: 'en', default_landing: 'companies' };
}

// GET /api/account — current user's profile + notifications + preferences.
router.get('/', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT ${PROFILE_COLS.join(', ')}, email, role, extra_fields, id_type, id_last4, id_collected_at FROM users WHERE id = $1`,
      [req.user.id],
    );
    const u = r.rows[0] || {};
    const extra = u.extra_fields || {};
    res.json({
      profile: {
        full_name: u.full_name, first_name: u.first_name, last_name: u.last_name,
        avatar_url: u.avatar_url, title: u.title, phone: u.phone,
        linkedin_url: u.linkedin_url, location: u.location, function_team: u.function_team,
        email: u.email, role: u.role,
        ...(extra.profile || {}),
      },
      notifications: { ...defaultNotifications(), ...(extra.notifications || {}) },
      preferences:   { ...defaultPreferences(),   ...(extra.preferences   || {}) },
      // Verification ID: only the type + masked last-4 ever leave the server.
      id: { provided: !!u.id_collected_at, type: u.id_type || null, last4: u.id_last4 || null },
    });
  } catch (err) { next(err); }
});

// PATCH /api/account — update any subset of profile / notifications / preferences.
router.patch('/', async (req, res, next) => {
  try {
    const { profile = {}, notifications, preferences } = req.body || {};

    // Merge extra_fields (read-modify-write keeps it simple + safe).
    const cur = await query(`SELECT extra_fields FROM users WHERE id = $1`, [req.user.id]);
    const extra = cur.rows[0]?.extra_fields || {};
    extra.profile = extra.profile || {};
    for (const k of EXTRA_PROFILE) if (k in profile) extra.profile[k] = profile[k] ?? null;
    if (notifications && typeof notifications === 'object') extra.notifications = { ...(extra.notifications || {}), ...notifications };
    if (preferences   && typeof preferences   === 'object') extra.preferences   = { ...(extra.preferences   || {}), ...preferences };

    const sets = [], vals = []; let i = 1;
    for (const c of PROFILE_COLS) {
      if (c in profile) { sets.push(`${c} = $${i++}`); vals.push(profile[c] ?? null); }
    }
    sets.push(`extra_fields = $${i++}`); vals.push(JSON.stringify(extra));
    sets.push(`updated_at = now()`);
    vals.push(req.user.id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/account/verify-id — store the registrant's national ID (QID) or, for
// a company/person expanding INTO Qatar, their Passport number, FOR VERIFICATION.
// The number is encrypted at rest (AES-256-GCM); only a masked last-4 comes back.
// Gated by BDI_COLLECT_ID (off by default) AND a configured encryption key, so it
// stays inert until the lawful basis is confirmed. Consent/purpose live in the
// Terms of Use (Val 2026-07-12).
router.post('/verify-id', async (req, res, next) => {
  try {
    if (String(process.env.BDI_COLLECT_ID || '') !== '1') return res.status(404).json({ error: 'id_collection_disabled' });
    if (!(await piiConfigured())) return res.status(503).json({ error: 'not_configured', reason: 'ID verification isn’t set up on this deployment yet.' });
    const norm = normalizeId(req.body?.id_type, req.body?.id_value);
    if (!norm.ok) return res.status(400).json({ error: 'invalid_id', reason: norm.reason });
    const enc = await encryptPII(norm.value);
    await query(
      `UPDATE users SET id_type = $2, id_value_enc = $3, id_last4 = $4, id_collected_at = now(), updated_at = now() WHERE id = $1`,
      [req.user.id, norm.type, enc, idLast4(norm.value)]);
    res.json({ ok: true, type: norm.type, last4: idLast4(norm.value) });
  } catch (err) { next(err); }
});

export default router;
