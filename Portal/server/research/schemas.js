// JSON schemas we hand to Firecrawl Agent for each research type.
//
// IMPORTANT: keep these FLAT and FORGIVING.
//
// Firecrawl Spark agents silently return data:null when they cannot satisfy
// a schema. Deeply nested objects, strict enums, and many required fields
// all push agents toward that null path. We keep:
//   • Top-level required = the minimum we need to render anything
//   • Item-level required = only the most essential field
//   • No enums (we classify post-hoc)
//   • Flat structure — no nested objects more than 2 levels deep
//
// The parser is responsible for mapping this back to research_reports +
// research_sources + research_citations.

// ---------------------------------------------------------------------------
// Company deep-dive
// ---------------------------------------------------------------------------
export const companySchema = {
  type: 'object',
  required: ['title','sections','sources'],
  properties: {
    title: {
      type: 'string',
      description: 'Title of the report. Format: "<Company Name> — Deep Research".',
    },
    summary: {
      type: 'string',
      description: 'Executive summary, 2-3 paragraphs of plain prose.',
    },
    sections: {
      type: 'array',
      description: 'Ordered report sections. Aim for 8-12 covering ownership, leadership, operations, financials, recent moves, people, regulatory, risks, sector, outlook.',
      items: {
        type: 'object',
        required: ['title','body_markdown'],
        properties: {
          title:         { type: 'string', description: 'Section heading.' },
          body_markdown: { type: 'string', description: 'Markdown body. Cite sources inline as [1], [2], [3] using 1-based indexes from the top-level sources array.' },
        },
      },
    },
    sources: {
      type: 'array',
      description: 'Every distinct source used. Index = 1-based position in this array. Body markdown cites these as [1], [2], etc.',
      items: {
        type: 'object',
        required: ['url'],
        properties: {
          url:     { type: 'string' },
          label:   { type: 'string', description: 'Short name like "QFC public register entry" or "Gulf Times, 2024-09-12".' },
          class:   { type: 'string', description: 'One of: filing, press, graph, industry, academic, court, web, other.' },
          excerpt: { type: 'string', description: 'The specific fact or sentence cited from this source.' },
        },
      },
    },
    // Structured facts about the TARGET company (optional — fill what the
    // evidence supports). Kept flat with minimal required fields so Spark
    // doesn't bail to data:null. Bell stores these as queryable rows.
    financials: {
      type: 'array',
      description: 'Financial facts about the target: revenue, net profit, valuation, funding raised, assets, employee count, etc. One entry per figure.',
      items: {
        type: 'object',
        required: ['metric'],
        properties: {
          metric:   { type: 'string', description: 'e.g. revenue, net_profit, valuation, funding_raised, assets, employees.' },
          value:    { type: 'string', description: 'The figure as reported, e.g. "QAR 1.2 billion".' },
          currency: { type: 'string' },
          period:   { type: 'string', description: 'e.g. FY2023, 2024-Q1.' },
        },
      },
    },
    shareholders: {
      type: 'array',
      description: 'Known shareholders / owners of the target and their stake.',
      items: {
        type: 'object',
        required: ['holder_name'],
        properties: {
          holder_name: { type: 'string' },
          holder_type: { type: 'string', description: 'person, company, government, fund, other.' },
          stake:       { type: 'string', description: 'Ownership stake as reported, e.g. "30%".' },
        },
      },
    },
    partnerships: {
      type: 'array',
      description: 'Partnerships, JVs, major suppliers/customers, or investor relationships of the target.',
      items: {
        type: 'object',
        required: ['partner_name'],
        properties: {
          partner_name: { type: 'string' },
          relationship: { type: 'string', description: 'partner, jv, supplier, customer, investor, subsidiary, parent.' },
          description:  { type: 'string' },
          since:        { type: 'string' },
        },
      },
    },
    // Flat at the top level (was nested in derived_entities — flatter is easier
    // for the agent to fill). Both fields are optional.
    derived_companies: {
      type: 'array',
      description: 'Other companies you discovered that connect to the target — subsidiaries, parents, JV partners, suppliers, customers, competitors. Include companies from ANY country (not only Qatar); Bell classifies them by country. Do not include the target itself.',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name:             { type: 'string' },
          country:          { type: 'string', description: 'Country the company is based in (e.g. Qatar, UAE, USA). Important — Bell uses this to classify Qatar vs international.' },
          website:          { type: 'string' },
          linkedin_url:     { type: 'string' },
          registration_no:  { type: 'string' },
          industry:         { type: 'string' },
          city:             { type: 'string' },
          relation:         { type: 'string', description: 'How they relate to the target (subsidiary, partner, competitor, etc).' },
        },
      },
    },
    derived_people: {
      type: 'array',
      description: 'People discovered who are connected to the target — board, executives, founders, investors.',
      items: {
        type: 'object',
        required: ['full_name'],
        properties: {
          full_name:    { type: 'string' },
          title:        { type: 'string' },
          company_name: { type: 'string', description: 'Which company they are/were at.' },
          linkedin_url: { type: 'string' },
          relation:     { type: 'string', description: 'How they relate to the target.' },
        },
      },
    },
  },
};

export const SCHEMAS = {
  company: companySchema,
  // person / sector / theme / region / regulation — added in R3
};

export function schemaFor(type) { return SCHEMAS[type] || null; }
