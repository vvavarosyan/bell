// Outreach email composer — writes like Bell's best salesperson, not like an AI.
//
// Hard guarantees (Val's rule: "no em-dashes, no AI vibe, human, professional"):
//   1. No em/en-dash ever survives (post-filtered unconditionally).
//   2. A banned-phrase scan catches AI clichés ("I hope this finds you well", "leverage",
//      "seamless", "unlock", "reach out", "in today's fast-paced", …). If the model trips it,
//      we retry once stricter, then fall back to a clean deterministic template.
//   3. Rule 2.1 — the email states only facts we KNOW (company name, industry, city, and what
//      Bell does). It never invents a claim about the recipient. Unknown → left unsaid.
//
// Marketing copy → Haiku (Rule 2.8). Bella (sonnet) is never used here, and temperature is
// fine on Haiku. If no LLM key is present, the deterministic template is used — preview and
// send both keep working offline.

import { getKey } from '../keychain.js';

const MODEL = process.env.BDI_OUTREACH_MODEL || 'claude-haiku-4-5-20251001';

// Phrases that scream "written by a bot". Case-insensitive substring match. Kept tight so it
// flags clichés, not ordinary words.
const AI_VIBE = [
  'i hope this email finds you well', 'i hope this finds you well', 'hope you are doing well',
  'in today\'s fast-paced', 'in the fast-paced', 'ever-evolving', 'ever-changing landscape',
  'leverage', 'seamless', 'seamlessly', 'unlock', 'unleash', 'elevate', 'supercharge',
  'game-changer', 'game changing', 'cutting-edge', 'cutting edge', 'state-of-the-art',
  'revolutionize', 'revolutionise', 'disrupt', 'synergy', 'synergies', 'streamline',
  'empower', 'holistic', 'robust solution', 'tailored solution', 'bespoke solution',
  'reach out', 'touch base', 'circle back', 'let\'s connect', 'delve', 'dive into', 'dive in',
  'at the end of the day', 'move the needle', 'low-hanging fruit', 'take it to the next level',
  'furthermore', 'moreover', 'in conclusion', 'that being said', 'rest assured',
  'we are thrilled', 'i am thrilled', 'excited to', 'boost your bottom line',
];

// ---- hard cleaners ---------------------------------------------------------
export function stripDashes(s) {
  return String(s || '')
    .replace(/\s*[—–]\s*/g, ', ')   // em/en-dash used as a break → comma
    .replace(/,\s*,/g, ',')          // tidy any double comma the swap created
    .replace(/,\s*\./g, '.');
}

export function hasAiVibe(s) {
  const t = String(s || '').toLowerCase();
  return AI_VIBE.some((p) => t.includes(p));
}

const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// A short, true value line grounded in what Bell actually does + the company's own industry.
function bellValueLine(industry, lang) {
  const ind = (industry || '').trim();
  if (lang === 'ar') {
    return ind
      ? `نتابع في Bell المناقصات الجديدة في قطاع ${ind} بقطر وإشارات الشراء وبيانات الشركات فور نشرها.`
      : 'نتابع في Bell المناقصات الجديدة بقطر وإشارات الشراء وبيانات الشركات فور نشرها.';
  }
  return ind
    ? `Bell tracks new Qatar tenders in ${ind}, buyer signals, and company data as they are published.`
    : 'Bell tracks new Qatar tenders, buyer signals, and company data across Qatar as they are published.';
}

// Deterministic, guaranteed-clean fallback. Plain, human, specific to what we know.
function templateEmail({ companyName, industry, lang, fromName }) {
  const name = (companyName || '').trim();
  if (lang === 'ar') {
    const body = [
      `فريق ${name || 'شركتكم'} المحترم،`,
      '',
      bellValueLine(industry, 'ar'),
      'الفكرة بسيطة: أن تصلكم الفرص المناسبة في قطر قبل غيركم، من مصدر واحد موثوق.',
      'إن كان هذا مفيدًا لكم، يسعدني أن أُريكم مثالًا حقيقيًا يخص مجال عملكم. يكفي أن تردّوا على هذه الرسالة.',
      '',
      'مع خالص التقدير،',
      `${fromName || 'فريق Bell'}`,
      'Bell — bell.qa',
    ].join('\n');
    return { subject: `فرص ${industry || 'قطر'} في مكان واحد`, body };
  }
  const body = [
    `Hello ${name || 'there'},`,
    '',
    bellValueLine(industry, 'en'),
    'The idea is simple: the right opportunities in Qatar reach you first, from one trusted place.',
    'If that is useful, I am happy to show you a real example from your line of work. A reply to this note is enough.',
    '',
    'Best regards,',
    `${fromName || 'The Bell team'}`,
    'Bell, bell.qa',
  ].join('\n');
  return { subject: `${industry ? industry + ' opportunities' : 'Qatar opportunities'} in one place`, body };
}

function systemPrompt(lang) {
  const langLine = lang === 'ar'
    ? 'Write the entire email in professional Modern Standard Arabic suited to Qatari business correspondence.'
    : lang === 'bilingual'
      ? 'Write the email in English first, then a blank line, then the same message in professional Modern Standard Arabic.'
      : 'Write the entire email in clear, professional English.';
  return [
    'You are the founder-side voice of Bell, a Qatar business-intelligence company. You write short, genuinely human sales notes to Qatari companies. You are respected, direct, and warm, never pushy.',
    langLine,
    'HARD RULES:',
    '- 60 to 110 words. Short sentences. No corporate padding.',
    '- Never use an em dash or en dash. Use a comma or a full stop.',
    '- Banned phrases (do not use anything like them): "I hope this finds you well", "leverage", "seamless", "unlock", "elevate", "reach out", "touch base", "cutting-edge", "game-changer", "in today\'s fast-paced", "synergy", "streamline", "empower", "delve", "dive in", "furthermore", "moreover".',
    '- State only what you are told is true about the recipient. Do NOT invent facts, numbers, tenders, or events about their company. If you were not given a fact, do not imply it.',
    '- One clear, low-pressure call to action: invite a reply, or offer to show a real example. No fake urgency.',
    '- Sign off with the given sender name and "Bell, bell.qa".',
    'Return STRICT JSON only: {"subject": "...", "body": "..."} with \\n for line breaks in body. No markdown, no preamble.',
  ].join('\n');
}

function userPrompt({ companyName, industry, city, website, angle }) {
  const facts = [
    companyName ? `Company name: ${companyName}` : null,
    industry ? `Their industry: ${industry}` : null,
    city ? `Their city: ${city}` : null,
    website ? `Their website: ${website}` : null,
  ].filter(Boolean).join('\n');
  return [
    'Write ONE outreach email to this company inviting them to try Bell.',
    'What Bell does (true, you may use this): tracks new Qatar government and semi-government tenders as they are published, surfaces buyer-intent signals, and holds enriched company and contact data across Qatar. One place to find the right opportunities and the right companies first.',
    angle ? `Angle for this email: ${angle}` : '',
    'Known facts about the recipient (use only these, invent nothing else):',
    facts || '(only that they are a Qatar company)',
  ].filter(Boolean).join('\n\n');
}

async function callHaiku(key, sys, user, { temperature = 0.7 } = {}) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 700, temperature,
      system: sys + ' Respond with ONLY the JSON object.',
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error('Anthropic HTTP ' + res.status + ': ' + (await res.text().catch(() => '')).slice(0, 160));
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJson(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function toHtml(bodyText, fromName) {
  const paras = String(bodyText || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const inner = paras.map((p) => `<p style="margin:0 0 14px;line-height:1.6">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#1a2233;max-width:560px">${inner}</div>`;
}

/**
 * Compose one outreach email. Returns { subject, text, html, source:'model'|'template'|'template_fallback' }.
 * Never throws for content reasons — always returns a clean email.
 */
export async function composeEmail({ companyName, industry, city, website, lang = 'en', angle = null, fromName = 'The Bell team' } = {}) {
  const clean = (obj) => {
    if (!obj || !obj.subject || !obj.body) return null;
    const subject = stripDashes(String(obj.subject)).trim().slice(0, 160);
    const body = stripDashes(String(obj.body)).trim();
    if (!subject || !body) return null;
    if (hasAiVibe(subject) || hasAiVibe(body)) return null;
    return { subject, body };
  };

  let key = null;
  try { key = await getKey('anthropic'); } catch { key = null; }

  if (key) {
    const sys = systemPrompt(lang);
    const usr = userPrompt({ companyName, industry, city, website, angle });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const strict = attempt === 0 ? sys : sys + '\nYour previous draft used a banned phrase or a dash. Rewrite it plainer and shorter. Absolutely no dashes and none of the banned phrases.';
        const got = clean(parseJson(await callHaiku(key, strict, usr, { temperature: attempt === 0 ? 0.7 : 0.4 })));
        if (got) return { subject: got.subject, text: got.body, html: toHtml(got.body, fromName), source: 'model' };
      } catch { /* fall through to template */ }
    }
    // Model produced nothing clean → deterministic template (still a real, good email).
    const t = templateEmail({ companyName, industry, lang, fromName });
    return { subject: stripDashes(t.subject), text: stripDashes(t.body), html: toHtml(stripDashes(t.body), fromName), source: 'template_fallback' };
  }

  const t = templateEmail({ companyName, industry, lang, fromName });
  return { subject: stripDashes(t.subject), text: stripDashes(t.body), html: toHtml(stripDashes(t.body), fromName), source: 'template' };
}

export { templateEmail, bellValueLine };
