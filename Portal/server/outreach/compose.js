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

// Append a light, deliverability-SAFE footer: a VISIBLE unsubscribe link (many people won't
// hunt for the mail-client one) + a physical address (a legitimacy signal filters look for).
// Deliberately text-forward with NO images/logo — a cold email that looks like a personal note
// lands in the inbox; a graphics-heavy "newsletter" is far likelier to be filtered. Called at
// SEND time because it needs the per-send unsubscribe URL.
export function withFooter({ text, html, unsubUrl, lang = 'en', address = null } = {}) {
  const addr = address || process.env.BDI_OUTREACH_ADDRESS || 'Doha, Qatar';
  const isAr = lang === 'ar';
  const brand = 'Bell · Qatar business intelligence · bell.qa';
  const unsubLabel = isAr ? 'لإلغاء الاشتراك' : 'Not interested? Unsubscribe';
  const textOut = `${text}\n\n----------\n${brand}\n${addr}\n${unsubLabel}: ${unsubUrl}`;
  const dir = isAr ? ' dir="rtl"' : '';
  const footerHtml = `<div${dir} style="margin-top:22px;padding-top:12px;border-top:1px solid #e2e6ee;font-size:12px;color:#8a93a6;line-height:1.7">
    <div>${esc(brand)}</div>
    <div>${esc(addr)}</div>
    <div style="margin-top:6px">${esc(unsubLabel)}: <a href="${esc(unsubUrl)}" style="color:#5b8cff">${isAr ? 'اضغط هنا' : 'click here'}</a>.</div>
  </div>`;
  return { text: textOut, html: `${html}${footerHtml}` };
}

// ---- reply classification --------------------------------------------------
// What did the reply MEAN? Deterministic rules first (they are the legally-important ones and
// must never depend on an LLM being up):
//   remove_me  — any wording asking to stop → treated as a MANDATORY unsubscribe by the caller.
//   auto_reply — out-of-office / autoresponder → not a human, must not stop the sequence.
// Everything else goes to Haiku for interested / not_interested; if the model is unavailable
// the reply stays 'unclassified' (never guessed — Rule 2.1).
const REMOVE_RX = /(unsubscribe|remove (me|us)|take (me|us) off|stop (emailing|sending|contacting)|don'?t (email|contact)|no more emails|delete my (email|address)|opt me out|قف عن|توقفوا عن|لا تراسل|أوقفوا|الغاء الاشتراك|إلغاء الاشتراك)/i;
const AUTOREPLY_RX = /(out of (the )?office|automatic reply|auto[-\s]?reply|autoreply|on (annual |sick )?leave|currently (away|travell?ing)|will (respond|reply) (when|upon|after)|delivery (status|failure)|undeliverable|خارج المكتب|رد تلقائي|رد آلي|في إجازة)/i;

export async function classifyReply({ subject = '', text = '' } = {}) {
  const t = (String(subject) + '\n' + String(text)).slice(0, 4000);
  if (REMOVE_RX.test(t)) return { class: 'remove_me', basis: 'rule' };
  if (AUTOREPLY_RX.test(t)) return { class: 'auto_reply', basis: 'rule' };
  let key = null;
  try { key = await getKey('anthropic'); } catch { key = null; }
  if (!key) return { class: 'unclassified', basis: 'no_model' };
  try {
    const raw = await callHaiku(key,
      'You classify a reply to a B2B sales email. Return STRICT JSON only: {"class":"interested"|"not_interested"|"auto_reply"|"remove_me"}. "interested" = they want to know more, a demo, a call, pricing, or asked a real question. "not_interested" = a human politely declining. "auto_reply" = an automated message. "remove_me" = any request to stop emailing.',
      'Subject: ' + String(subject).slice(0, 200) + '\n\nReply:\n' + String(text).slice(0, 2500),
      { temperature: 0 });
    const parsed = parseJson(raw);
    const cls = parsed?.class;
    if (['interested', 'not_interested', 'auto_reply', 'remove_me'].includes(cls)) return { class: cls, basis: 'model' };
  } catch { /* fall through */ }
  return { class: 'unclassified', basis: 'model_failed' };
}

export { templateEmail, bellValueLine };
