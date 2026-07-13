// Conservative entity extraction from Qatar Knowledge pages. Rule-based and
// high-precision by design — Bell never guesses (Rule 2.1). Every extracted
// entity carries a short verbatim PROOF snippet (the surrounding text) so a
// human/Bella can always see exactly where it came from; nothing is inferred.
//
// Four entity kinds:
//   • law_refs  — verbatim legal citations ("Law No. 10 of 1987", "Decree-Law
//                 No. 8 of 2016", "Amiri Decision No. 22 of 2014" …).
//   • bodies    — Qatar ministries / authorities, matched ONLY against a curated
//                 controlled vocabulary (so an unknown phrase is never invented).
//   • amounts   — verbatim monetary mentions in Qatari Riyals (fees/penalties).
//   • officials — PDPPL-SENSITIVE. Honorific+name mentions in PUBLIC capacity.
//                 Stored for KB reference/search only; never wired to outreach
//                 until the PDPPL lawyer signs off (working-agreement §2.7).
//
// Pure module (no DB/network) → unit-testable against real captured fixtures.

// A short verbatim proof window around a match (single-lined, trimmed).
function proofAround(text, index, len, pad = 90) {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + len + pad);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

const uniqBy = (arr, keyFn, cap) => {
  const seen = new Set(); const out = [];
  for (const x of arr) { const k = keyFn(x); if (seen.has(k)) continue; seen.add(k); out.push(x); if (out.length >= cap) break; }
  return out;
};

// ── law_refs ────────────────────────────────────────────────────────────────
// Instrument kinds Qatar uses. Number may be bare or parenthesised: "No. (10)".
// Year phrased "of 1987" or "for the year 1987". Kept verbatim.
const LAW_KIND = '(?:Constitution|Decree[-\\s]?Law|Law|Decree|Amiri Decision|Emiri Decision|Amiri Order|Emiri Order|Council of Ministers(?: Resolution| Decision)?|Ministerial (?:Resolution|Decision)|Resolution|Decision)';
const LAW_RE = new RegExp(
  `\\b${LAW_KIND}\\s+No\\.?\\s*\\(?\\s*(\\d{1,4})\\s*\\)?\\s+(?:of|for the year)\\s+((?:19|20)\\d{2})\\b`,
  'gi');

// Arabic legal citation — Arabic is the authoritative legal language in Qatar, so
// Arabic-only laws must be captured too. Instrument (قانون/مرسوم/قرار/دستور …) then
// "رقم (N) لسنة YYYY". Digits may be Arabic-Indic (٠-٩) or Western.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const normDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
const LAW_RE_AR = new RegExp(
  `(?:قانون|مرسوم(?:\\s+بقانون)?|قرار(?:\\s+مجلس\\s+الوزراء| أميري| وزاري)?|إعلان دستوري)\\s*(?:رقم)?\\s*\\(?\\s*([\\d${AR_DIGITS}]{1,4})\\s*\\)?\\s*لسنة\\s*([\\d${AR_DIGITS}]{4})`,
  'g');

export function extractLawRefs(text) {
  const out = [];
  for (const m of text.matchAll(LAW_RE)) {
    const raw = m[0].replace(/\s+/g, ' ').trim();
    out.push({ text: raw, number: m[1], year: m[2], lang: 'en', proof: proofAround(text, m.index, m[0].length) });
  }
  for (const m of text.matchAll(LAW_RE_AR)) {
    const raw = m[0].replace(/\s+/g, ' ').trim();
    out.push({ text: raw, number: normDigits(m[1]), year: normDigits(m[2]), lang: 'ar', proof: proofAround(text, m.index, m[0].length) });
  }
  return uniqBy(out, (x) => x.text.toLowerCase(), 60);
}

// ── bodies (controlled vocabulary) ────────────────────────────────────────────
// Only these known Qatar entities are ever emitted. `re` matches common phrasings
// incl. British/US spelling; `name` is the canonical label we store.
const BODIES = [
  ['Ministry of Foreign Affairs', /Ministry of Foreign Affairs/i],
  ['Ministry of Interior', /Ministry of (?:the )?Interior/i],
  ['Ministry of Defence', /Ministry of Defen[cs]e/i],
  ['Ministry of Finance', /Ministry of Finance/i],
  ['Ministry of Commerce and Industry', /Ministry of Commerce(?: and Industry)?/i],
  ['Ministry of Municipality', /Ministry of Municipality(?: and Environment)?/i],
  ['Ministry of Public Health', /Ministry of Public Health/i],
  ['Ministry of Education and Higher Education', /Ministry of Education(?: and Higher Education)?/i],
  ['Ministry of Labour', /Ministry of Labou?r/i],
  ['Ministry of Justice', /Ministry of Justice/i],
  ['Ministry of Environment and Climate Change', /Ministry of Environment(?: and Climate Change)?/i],
  ['Ministry of Communications and Information Technology', /Ministry of Communications and Information Technology/i],
  ['Ministry of Transport', /Ministry of Transport(?:ation)?/i],
  ['Ministry of Culture', /Ministry of Culture(?: and Sports)?/i],
  ['Ministry of Sports and Youth', /Ministry of Sports and Youth/i],
  ['Ministry of Endowments and Islamic Affairs', /Ministry of (?:Endowments and Islamic Affairs|Awqaf(?: and Islamic Affairs)?)/i],
  // Kept as two distinct entries — "Social Affairs" (pre-2021) and "Social
  // Development and Family" (current) are materially different bodies; folding one
  // into the other would make Bell cite a name the page never used (Rule 2.1).
  ['Ministry of Social Development and Family', /Ministry of Social Development and Family/i],
  ['Ministry of Social Affairs', /Ministry of Social Affairs/i],
  ['Amiri Diwan', /Amiri Diwan|Emiri Diwan/i],
  ['Council of Ministers', /Council of Ministers|Cabinet of Qatar/i],
  ['Shura Council', /Shura Council/i],
  ['Qatar Central Bank', /Qatar Central Bank|\bQCB\b/],
  ['Qatar Financial Centre', /Qatar Financial Centre|\bQFC\b/],
  ['Qatar Financial Centre Regulatory Authority', /Qatar Financial Centre Regulatory Authority|\bQFCRA\b/],
  ['Qatar Financial Markets Authority', /Qatar Financial Markets Authority|\bQFMA\b/],
  ['General Tax Authority', /General Tax Authority/i],
  ['General Authority of Customs', /General Authority of Customs/i],
  ['National Human Rights Committee', /National Human Rights Committee/i],
  ['Planning and Statistics Authority', /Planning and Statistics Authority|\bPSA\b/],
  ['Communications Regulatory Authority', /Communications Regulatory Authority|\bCRA\b/],
  ['National Cyber Security Agency', /National Cyber Security Agency|\bNCSA\b/],
  ['National Cyber Governance and Assurance Affairs', /National Cyber Governance and Assurance Affairs/i],
  ['Qatar Investment Authority', /Qatar Investment Authority|\bQIA\b/],
  ['Government Communications Office', /Government Communications Office|\bGCO\b/],
  ['Qatar Free Zones Authority', /Qatar Free Zones? Authority|\bQFZA?\b/],
  ['Qatar Development Bank', /Qatar Development Bank|\bQDB\b/],
  ['Invest Qatar', /Invest Qatar|Investment Promotion Agency Qatar|\bIPA Qatar\b/],
];

export function extractBodies(text) {
  const out = [];
  for (const [name, re] of BODIES) {
    const m = text.match(re);
    // `name` is the canonical label (grouping key); `matched` is the VERBATIM
    // phrase the page used — surfaced to Bella so she cites exactly what the
    // source said, never a canonical expansion the page didn't use (Rule 2.1).
    if (m) out.push({ name, matched: m[0].replace(/\s+/g, ' ').trim(), proof: proofAround(text, text.indexOf(m[0]), m[0].length) });
  }
  return uniqBy(out, (x) => x.name, 40);
}

// ── amounts (Qatari Riyals) ───────────────────────────────────────────────────
// Decimal is INSIDE each capture group so `value` and the verbatim `text` keep the
// fraction — a fee of "QAR 1,000.50" must not be stored as 1000 (Rule 2.1). A trailing
// MAGNITUDE word (million/billion/…) is captured too: "QAR 8.9 billion" was being
// stored as the misleading "QAR 8.9". The verbatim text keeps the word AND value is
// scaled by it (arithmetic on the stated figure, not a guess).
const MAGWORD = '(thousand|million|billion|trillion|mn|bn|مليون|مليار|ألف|تريليون)';
const AMOUNT_RE = new RegExp(
  `\\b(?:QAR|QR|﷼)\\s?([\\d,]{1,15}(?:\\.\\d+)?)(?:\\s?${MAGWORD})?` +
  `|\\b([\\d,]{1,15}(?:\\.\\d+)?)(?:\\s?${MAGWORD})?\\s?(?:Qatari Riyals?|Riyals?|QR|QAR)\\b`,
  'gi');
const MAG_MULT = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12, mn: 1e6, bn: 1e9, 'ألف': 1e3, 'مليون': 1e6, 'مليار': 1e9, 'تريليون': 1e12 };

export function extractAmounts(text) {
  const out = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const digits = (m[1] || m[3] || '').replace(/,/g, '');
    if (!digits || digits.replace(/\./g, '').length > 15) continue;
    const mag = (m[2] || m[4] || '').toLowerCase();
    let value = Number(digits);
    if (mag && MAG_MULT[mag]) value *= MAG_MULT[mag];
    if (!Number.isFinite(value) || value <= 0) continue;   // drop 0.00 / meaningless amounts
    out.push({ text: m[0].replace(/\s+/g, ' ').trim(), value, proof: proofAround(text, m.index, m[0].length) });
  }
  return uniqBy(out, (x) => x.text.toLowerCase() + x.value, 30);
}

// ── officials (PDPPL-sensitive; public capacity) ──────────────────────────────
// Honorific + Arabic-style name (2–5 tokens incl. bin/bint/Al). Kept for KB
// reference; NEVER used for outreach until lawyer sign-off (§2.7).
const HONORIFIC = '(?:His Highness|Her Highness|H\\.H\\.|His Excellency|Her Excellency|H\\.E\\.|Sheikh|Sheikha|Dr\\.|Mr\\.|Ms\\.|Eng\\.)';
const NAMEPART = "[A-Z][A-Za-z'\\-]+";
// NAMEPART must come BEFORE the bare "Al" in the alternation, else "Al-Thani" (one
// hyphenated token) matches the literal "Al" and strands "-Thani" — which truncated
// ~51% of extracted names at the family prefix, incl. the Amir's. NAMEPART already
// matches "Al" and "Al-Thani", so the lowercase particles are all that stay explicit.
const OFFICIAL_RE = new RegExp(
  `\\b${HONORIFIC}(?:\\s+${HONORIFIC})?\\s+(${NAMEPART}(?:\\s+(?:bin|bint|el|${NAMEPART})){1,6})`,
  'g');

// Generic place / institution / headline words. If the captured name contains any
// of these, the regex wandered out of a personal name into a landmark ("Sheikh
// Jassim Bin Mohammed Grand Mosque") or a headline ("His Highness The Amir
// Patronizes The Opening") — reject it rather than fabricate a person (Rule 2.1).
const NOT_A_NAME = /\b(?:Mosque|Grand|Street|Road|Tower|Hospital|Airport|Stadium|Park|Bridge|Centre|Center|City|Medical|University|College|School|Museum|Palace|Hotel|Company|Corporation|Authority|Ministry|Committee|Council|Department|Building|Complex|Station|Port|Terminal|Highway|Avenue|District|Zone|Hall|Institute|Foundation|Bank|Housing|Fund|Stadium|Opening|Ceremony|Session|Forum|Summit|Meeting|Conference|Patroni[sz]e[sd]?|Inaugurate[sd]?|Attend(?:s|ed)?|Receive[sd]?|Launch(?:e[sd])?|Meets?|Of|And|For|The|In|At|On|To)\b/;

// A name with no delimiter often runs straight into the next heading in plain-text
// ("… Al-Hammadi Academic Qualifications"). Trim these known section/heading words
// (and everything after) off the TAIL — trim, not reject, so we keep the real name.
const NAME_STOP_SUFFIX = /\s+(?:Academic|Qualifications?|Biography|Profile|Career|Education|Experience|Overview|Contact|Details|Information|News|Home|Menu|Search|Speech|Statement|Message|Vision|Mission|Awards?|Achievements?|Assumed|Has|Was|Is|Will|Under|During|Minister|Prime|Deputy|Chairman|President|Director|Secretary)\b[\s\S]*$/;

export function extractOfficials(text) {
  const raw = [];
  for (const m of text.matchAll(OFFICIAL_RE)) {
    // Validate the captured NAME group (m[1]), not the honorific-prefixed whole match.
    const name = (m[1] || '').replace(/\s+/g, ' ').replace(NAME_STOP_SUFFIX, '').trim();
    if (!name || NOT_A_NAME.test(name)) continue;
    // Require a genuine Arabic name particle (bin/bint/al/el) or an "Al <Surname>"
    // family marker. A lone honorific + capitalised word is not proof of a person;
    // Rule 2.1 says err toward NOT claiming one.
    if (!/\b(?:bin|bint|al|el)\b/i.test(name) && !/\bAl[- ][A-Z]/.test(name)) continue;
    // Rebuild the full "<honorific> <name>" with the trimmed name (honorific = m[0] up to m[1]).
    const hono = m[0].slice(0, m[0].length - (m[1] || '').length);
    const full = (hono + name).replace(/\s+/g, ' ').trim();
    raw.push({ name: full, sensitive: true, proof: proofAround(text, m.index, m[0].length) });
  }
  // Drop truncated duplicates: the same person captured with fewer name tokens.
  // Compare on core tokens (honorifics stripped): if a candidate's tokens are all
  // contained in an already-kept (longer) name, it is the same person → skip.
  const byLen = uniqBy(raw, (x) => x.name.toLowerCase(), 60).sort((a, b) => b.name.length - a.name.length);
  const kept = [];
  for (const o of byLen) {
    o._toks = coreNameTokens(o.name);
    if (o._toks.size && kept.some((k) => [...o._toks].every((t) => k._toks.has(t)))) continue;
    kept.push(o);
    if (kept.length >= 25) break;
  }
  return kept.map(({ _toks, ...o }) => o);
}

const HONORIFIC_STRIP = /^(?:His Highness|Her Highness|H\.H\.|His Excellency|Her Excellency|H\.E\.|Sheikh|Sheikha|Dr\.|Mr\.|Ms\.|Eng\.)\s+/i;
function coreNameTokens(name) {
  let n = String(name || '');
  while (HONORIFIC_STRIP.test(n)) n = n.replace(HONORIFIC_STRIP, '');
  return new Set(n.toLowerCase().split(/\s+/).filter(Boolean));
}

// Full extraction for one page's text. Returns null when nothing found (so the
// column stays clean/empty rather than storing empty arrays everywhere).
export function extractEntities(text) {
  const t = String(text || '');
  if (t.length < 40) return null;
  const law_refs = extractLawRefs(t);
  const bodies = extractBodies(t);
  const amounts = extractAmounts(t);
  const officials = extractOfficials(t);
  if (!law_refs.length && !bodies.length && !amounts.length && !officials.length) return null;
  const out = {};
  if (law_refs.length) out.law_refs = law_refs;
  if (bodies.length) out.bodies = bodies;
  if (amounts.length) out.amounts = amounts;
  if (officials.length) out.officials = officials;
  return out;
}

// A compact, human/Bella-friendly one-line summary of a page's entities.
export function summarizeEntities(ent) {
  if (!ent) return '';
  const parts = [];
  if (ent.law_refs?.length) parts.push(ent.law_refs.slice(0, 4).map((x) => x.text).join('; '));
  if (ent.bodies?.length) parts.push(ent.bodies.slice(0, 5).map((x) => x.name).join(', '));
  if (ent.amounts?.length) parts.push(ent.amounts.slice(0, 3).map((x) => x.text).join(', '));
  return parts.join(' · ');
}
