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
  const anchorBlock = [
    anchorLine('Name',           job.target_company_name || job.target_label),
    anchorLine('Registration #', job.target_company_bin || job.target_company_primary_registration_no),
    anchorLine('Industry',       job.target_company_industry),
    anchorLine('Website',        job.target_company_website),
    anchorLine('LinkedIn',       job.target_company_linkedin_url),
    anchorLine('City',           job.target_company_city || 'Doha'),
  ].filter(Boolean).join('\n');

  return `Deep research on "${name}", a Qatar-based company. Produce a structured cited report conforming to the provided JSON schema.

Known facts about the target:
${anchorBlock || '- Name: ' + name}

User's brief: "${job.brief}"

What the report must cover (one section each, 8-12 sections total):
1. Executive summary
2. Ownership & shareholders
3. Leadership & governance
4. Business operations & revenue model
5. Financial trajectory
6. Recent strategic moves (M&A, partnerships, expansions)
7. Key people & relationships
8. Regulatory & compliance standing
9. Sector position vs Qatari peers
10. Risks & dependencies
11. Forward outlook & signals
12. Open questions for follow-up

Sources to draw from (use as many as relevant):
- Qatar registries: MOCI businessmap, QFC public register, QFZ, QSTP, Qatar Chamber
- The company's own website (About, Leadership, Press) and LinkedIn
- Press: Gulf Times, The Peninsula, Doha News, Al-Sharq, Qatar Tribune, Reuters, Bloomberg, FT
- Industry reports, ministry releases, regulator bulletins, court records

Citations are mandatory. Use [1], [2], [3] inline in body_markdown — the bracketed number is the 1-based index in the top-level sources[] array. Do not produce a section paragraph without at least one citation. If evidence is thin for a topic, write "Limited evidence" and explain what is missing.

Snowball — fill derived_companies and derived_people with OTHER Qatar entities you encountered while researching: subsidiaries, parents, JV partners, competitors, board members, executives, investors. Do not include "${name}" itself.

Write in clear analytical English. No speculation; if uncertain, say so.`;
}

// Anchor URLs — give the agent concrete starting points so it doesn't bail
// out with data:null on an open-ended research prompt. Skip anything we
// don't know. Cap at 5 URLs to keep the request light.
export function companyAnchors(job) {
  const urls = [];
  if (job.target_company_website)       urls.push(job.target_company_website);
  if (job.target_company_linkedin_url)  urls.push(job.target_company_linkedin_url);
  // Add the relevant Qatar registry URLs — the agent can hop to the public-
  // register search and look up the target itself.
  urls.push('https://eservices.qfc.qa/QFCPublicRegister/PublicRegister.aspx');
  urls.push('https://businessmap.moci.gov.qa');
  if (urls.length < 5) urls.push('https://www.linkedin.com/');
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
