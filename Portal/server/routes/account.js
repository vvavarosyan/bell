// /api/account — the signed-in user's own profile, notification settings, and
// preferences. Core profile fields live in `users` columns; the richer fields
// (department, bio, booking link, email signature, …) plus notifications and
// preferences live in users.extra_fields so we can extend them freely.

import { Router } from 'express';
import { query } from '../db.js';

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
];

function defaultNotifications() {
  return {
    sequence_replies: true,    // a prospect replied to a sequence
    weekly_digest:    true,    // weekly performance digest
    credit_low:       true,    // credit balance running low
    product_updates:  true,    // Bell product news
  };
}
function defaultPreferences() {
  return { timezone: null, locale: 'en', default_landing: 'companies' };
}

// GET /api/account — current user's profile + notifications + preferences.
router.get('/', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT ${PROFILE_COLS.join(', ')}, email, role, extra_fields FROM users WHERE id = $1`,
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

export default router;
