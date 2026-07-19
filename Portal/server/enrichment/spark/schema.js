// Firecrawl Spark batch-enrichment schema + prompt (Val's deep-data program, 2026-07-20).
//
// HARD-WON DOCTRINE (from Bell's research/schemas.js — the data:null trap): Spark agents
// silently return null when pushed with strict schemas, deep nesting, enums, or many required
// fields. So: FLAT items, required = bell_id only, everything else optional, no enums,
// per-field descriptions doing the work. Facts must carry source URLs — unsourced facts are
// quarantined at ingest, never asserted (Rule 2.1).

export const SPARK_SCHEMA = {
  type: 'object',
  required: ['companies'],
  properties: {
    companies: {
      type: 'array',
      description: 'One entry per company from the submitted list, in any order. Include an entry EVEN IF nothing was found (bell_id + found:false).',
      items: {
        type: 'object',
        required: ['bell_id'],
        properties: {
          bell_id: { type: 'number', description: 'Copy the numeric id column of the submitted row VERBATIM. This is how results are matched — never invent or omit it.' },
          found: { type: 'boolean', description: 'false if no reliable information about this specific company could be found.' },
          confirmed_name: { type: 'string', description: 'The company name as it appears on its own website/official sources.' },
          website: { type: 'string', description: 'Official website URL. Only if confident it belongs to THIS company.' },
          description: { type: 'string', description: 'What the company actually does, 2-4 sentences, from its own materials.' },
          emails: { type: 'array', items: { type: 'string' }, description: 'Every email address found for this company (website, directories, social pages).' },
          phones: { type: 'array', items: { type: 'string' }, description: 'Phone numbers with country code where visible.' },
          whatsapp: { type: 'array', items: { type: 'string' }, description: 'WhatsApp numbers (from wa.me links or listings).' },
          social_links: { type: 'array', items: { type: 'string' }, description: 'Full URLs: LinkedIn, Instagram, Facebook, X, TikTok, YouTube pages of the company.' },
          addresses: { type: 'array', items: { type: 'string' }, description: 'Physical addresses/branches, verbatim as published (keep Zone/Street/Building numbers).' },
          registration_number: { type: 'string', description: 'CR / commercial registration number if published.' },
          leadership: {
            type: 'array', description: 'Executives/managers/owners with titles.',
            items: { type: 'object', required: ['name'], properties: {
              name: { type: 'string' }, title: { type: 'string' }, source_url: { type: 'string' },
            } },
          },
          owners: {
            type: 'array', description: 'Shareholders/owners as stated in sources.',
            items: { type: 'object', required: ['name'], properties: {
              name: { type: 'string' }, stake: { type: 'string', description: 'e.g. "51%" or "majority" — verbatim.' }, source_url: { type: 'string' },
            } },
          },
          financials: {
            type: 'array', description: 'Any stated financial figures (revenue, capital, employees, funding). VERBATIM values with period.',
            items: { type: 'object', required: ['metric'], properties: {
              metric: { type: 'string' }, value: { type: 'string' }, period: { type: 'string' }, source_url: { type: 'string' },
            } },
          },
          partnerships: {
            type: 'array', description: 'Partners, clients, distributors, franchises as published.',
            items: { type: 'object', required: ['partner_name'], properties: {
              partner_name: { type: 'string' }, description: { type: 'string' }, source_url: { type: 'string' },
            } },
          },
          rating: { type: 'number', description: 'Google/other review rating if found.' },
          reviews_count: { type: 'number' },
          reviews_summary: { type: 'string', description: '1-2 sentences: what reviewers say.' },
          news: {
            type: 'array', description: 'Recent news mentions.',
            items: { type: 'object', required: ['headline'], properties: {
              headline: { type: 'string' }, date: { type: 'string' }, source_url: { type: 'string' },
            } },
          },
          related_companies: {
            type: 'array', description: 'OTHER companies discovered while researching this one: partners, parents, subsidiaries, sister companies, competitors. Include non-Qatar ones and say the country.',
            items: { type: 'object', required: ['name'], properties: {
              name: { type: 'string' }, country: { type: 'string' }, website: { type: 'string' },
              relation: { type: 'string', description: 'partner / parent / subsidiary / sister / competitor / mentioned-with' }, source_url: { type: 'string' },
            } },
          },
          source_urls: { type: 'array', items: { type: 'string' }, description: 'Every URL used for this company.' },
        },
      },
    },
  },
};

/** Build the prompt for one batch. rows = [{id, name, cr, city, website}]. */
export function buildPrompt(rows) {
  const head = [
    'You are researching QATAR companies for a business-intelligence database. For EACH company in the list below, gather every piece of public information you can find: official website, what they do, ALL contact details (emails, phones, WhatsApp), social media pages, physical addresses/branches (keep Zone/Street/Building numbers verbatim), commercial registration number, leadership and owners, stated financial figures, partnerships/clients, review ratings, recent news, and any RELATED companies you come across (partners, parents, subsidiaries — including non-Qatar ones, with their country).',
    'Rules: only include facts about the EXACT company listed (match name and Qatar context; the CR number and city help disambiguate). If you are not confident a fact belongs to this specific company, leave the field out. Never invent values. Attach source URLs. If nothing reliable is found for a company, return it with found:false.',
    'The list (id | name | CR | city | website):',
  ].join('\n');
  const lines = rows.map((r) => [r.id, r.name, r.cr || '', r.city || '', r.website || ''].join(' | '));
  return head + '\n' + lines.join('\n');
}

/** How many rows fit the 10k-char prompt cap (~9.3k budget after the header). */
export function fitBatch(rows, maxChars = 9300) {
  const headLen = buildPrompt([]).length;
  let used = headLen;
  const out = [];
  for (const r of rows) {
    const len = String([r.id, r.name, r.cr || '', r.city || '', r.website || ''].join(' | ')).length + 1;
    if (used + len > maxChars) break;
    used += len;
    out.push(r);
  }
  return out;
}
