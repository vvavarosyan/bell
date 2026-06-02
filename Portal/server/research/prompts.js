// Prompt builders + anchor-URL builders per research type.
//
// Each type exports:
//   • promptFor(job)     → string prompt for Firecrawl Agent
//   • anchorsFor(job)    → string[] of URLs the agent can start from
//                          (gives it ground truth instead of guessing where
//                           to start — empirically: agents return data:null
//                           when handed a research prompt with no anchors).

function anchorLine(label, value) {
  if (value === null || value === undefined || value === '') return null;
  return `- ${label}: ${String(value).trim()}`;
}

// ---------------------------------------------------------------------------
// Company deep-dive
// ---------------------------------------------------------------------------
export function companyPrompt(job) {
  const name = job.target_company_name || job.target_label || 'the target company';
  // Anchors are STARTING POINTS only — the agent must expand beyond them. We do
  // NOT pass Bell's internal BIN (it's meaningless to a web agent) or the city
  // (often our own guess; stating it as fact biases the agent). We pass only the
  // real public registration number when we have one.
  const anchorBlock = [
    anchorLine('Name',                 job.target_company_name || job.target_label),
    anchorLine('Public registration #', job.target_company_primary_registration_no),
    anchorLine('Industry (hint)',      job.target_company_industry),
    anchorLine('Known website',        job.target_company_website),
    anchorLine('Known LinkedIn',       job.target_company_linkedin_url),
  ].filter(Boolean).join('\n');

  return `Deep research on "${name}", a Qatar-based company. Produce a structured cited report conforming to the provided JSON schema.

Starting points (verify and EXPAND — these are leads, not limits):
${anchorBlock || '- Name: ' + name}

Do NOT restrict yourself to the URLs or sources listed here. Independently search the open web for this company: its other websites and domains, social profiles, subsidiaries' pages, news coverage, filings, and databases. The known website/LinkedIn above are just where to start — discover and analyse anything else you find about the same company.

User's brief: "${job.brief}"

The report should cover (merge/reorder/skip as the evidence warrants — aim for 8-12 sections):
- Executive summary
- Ownership & shareholders
- Leadership & governance
- Business operations & revenue model
- Financial trajectory (last 3-5 years where signals exist)
- Recent strategic moves (M&A, partnerships, expansions, capital raises)
- Key people & relationships
- Regulatory & compliance standing
- Sector position vs Qatari peers
- Risks & dependencies
- Forward outlook & signals
- Open questions for follow-up

Useful places to look include (but are NOT limited to):
- Qatar registries: MOCI businessmap, QFC public register, QFZ, QSTP, Qatar Chamber
- The company's own website(s) (About, Leadership, Press) and LinkedIn
- Press: Gulf Times, The Peninsula, Doha News, Al-Sharq, Qatar Tribune, Reuters, Bloomberg, FT
- Industry reports, ministry releases, regulator bulletins, court records

Citations are mandatory. Use [1], [2], [3] inline in body_markdown — the bracketed number is the 1-based index in the top-level sources[] array. Do not produce a section paragraph without at least one citation. If evidence is thin for a topic, write "Limited evidence" and explain what is missing.

Snowball — fill derived_companies and derived_people with OTHER entities you encountered while researching: subsidiaries, parents, JV partners, suppliers, customers, competitors, board members, executives, investors. Include entities from ANY country, not only Qatar — for each company set its "country" so it can be classified. For each entity set "relation" describing how it connects to the target. Do not include "${name}" itself.

Write in clear analytical English. No speculation; if uncertain, say so.`;
}

// Anchor URLs — concrete STARTING points so the agent doesn't bail out with
// data:null on an open-ended prompt. The prompt explicitly tells it to expand
// beyond these. Only real, useful URLs — no filler homepages.
export function companyAnchors(job) {
  const urls = [];
  if (job.target_company_website)       urls.push(job.target_company_website);
  if (job.target_company_linkedin_url)  urls.push(job.target_company_linkedin_url);
  // Qatar public registers — good starting points for a Qatar company. The
  // agent can search these for the target; it is not constrained to them.
  urls.push('https://eservices.qfc.qa/QFCPublicRegister/PublicRegister.aspx');
  urls.push('https://businessmap.moci.gov.qa');
  return [...new Set(urls)].slice(0, 5);
}

export const PROMPT_BUILDERS = {
  company: companyPrompt,
};
export const ANCHOR_BUILDERS = {
  company: companyAnchors,
};

export function buildPrompt(type, job) {
  const fn = PROMPT_BUILDERS[type];
  if (!fn) throw new Error('No prompt builder for type: ' + type);
  return fn(job);
}
export function buildAnchorUrls(type, job) {
  const fn = ANCHOR_BUILDERS[type];
  return fn ? fn(job) : [];
}
