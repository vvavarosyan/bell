// Qatar time — the one place the platform reasons about "what time is it in Qatar".
//
// Bell is a Qatar product but ran entirely on the server's clock (UTC on Railway): a grep
// found ZERO Asia/Qatar references server-wide. That broke two things — Bella couldn't
// schedule "tonight" (she was never told the current time, so she guessed a run_at that
// landed in the past and the tool rejected it), and the outreach engine has no way to honour
// "Sat–Thu, 07:00–17:00 Qatar".
//
// Qatar = Asia/Qatar = UTC+3 (AST), and it observes NO daylight saving — so the offset is a
// constant +03:00 all year. That makes the maths exact: a naked local time is unambiguous.

export const QATAR_TZ = 'Asia/Qatar';
export const QATAR_OFFSET = '+03:00';   // constant — Qatar has no DST

const FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: QATAR_TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

// "Friday, 17 July 2026, 20:47" — a human, unambiguous stamp in Qatar time.
export function formatQatar(date = new Date()) {
  const p = Object.fromEntries(FMT.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`;
}

// The Qatar wall-clock fields for an instant (numbers), via Intl so DST/offset is never
// hand-computed. weekday: 0=Sunday … 6=Saturday (JS convention).
export function qatarParts(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: QATAR_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  let hour = Number(p.hour);
  if (hour === 24) hour = 0;   // Intl hour12:false can emit '24' at midnight
  return { year: +p.year, month: +p.month, day: +p.day, hour, minute: Number(p.minute), weekday: wd };
}

// Parse a datetime STRING as Qatar-local when it carries no timezone. If it already has a Z
// or ±hh:mm offset, that is respected. This is what lets "schedule for 21:00" mean 21:00 in
// Doha, not 21:00 UTC. Returns a Date, or null if unparseable.
export function parseQatarLocal(str) {
  if (!str) return null;
  const s = String(str).trim();
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasTz ? s : s + QATAR_OFFSET);
  return isNaN(d.getTime()) ? null : d;
}

// Is this instant inside Bell's outreach send window? Val's rule (2026-07-17):
// Saturday–Thursday (NO Friday), 07:00–17:00 Qatar time. Phase-1 building block.
export const WORK_START_HOUR = 7;
export const WORK_END_HOUR = 17;   // exclusive: last send may go out at 16:59
export function isQatarWorkingHour(date = new Date()) {
  const { weekday, hour } = qatarParts(date);
  if (weekday === 5) return false;                 // Friday — never
  return hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
}

// The next instant that IS a working hour (>= from). Used to defer a send/step to the next
// legal slot instead of firing at 03:00 or on a Friday.
export function nextQatarWorkingTime(from = new Date()) {
  const d = new Date(from);
  for (let i = 0; i < 24 * 8; i++) {               // scan forward hour by hour, <= 8 days
    if (isQatarWorkingHour(d)) {
      // Snap to the top of the hour we entered, or to WORK_START if we jumped a boundary.
      return d;
    }
    d.setUTCMinutes(0, 0, 0);
    d.setUTCHours(d.getUTCHours() + 1);
  }
  return d;
}
