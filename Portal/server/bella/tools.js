// Bella — server-side tool registry (Phase G1: read + navigate tools).
//
// THE ISOLATION MECHANISM (locked commitment #2): Bella never touches the DB
// directly. Every tool dispatches into the SAME Express routers the user's
// browser calls — in-process, with the caller's real req.user/req.tenant
// attached — so tenant isolation, reveal masking (maskCompanies/maskPeople),
// the People lockdown, and role gates all apply exactly as they do in the UI.
// The model only ever sees named tools; SQL, keys, and raw tables stay
// server-side.
//
// G1 tools are read-only + navigation. Action tools (reveal / CRM / email /
// sequences) arrive in G2 behind the approval gate — the `requires_approval`
// flag on each definition is the hook the brain already honors.

import companiesRouter from '../routes/companies.js';
import jobsRouter      from '../routes/jobs.js';
import feedRouter      from '../routes/feed.js';
import signalsRouter   from '../routes/signals.js';
import creditsRouter   from '../routes/credits.js';
import icpRouter       from '../routes/icp.js';
import statsRouter     from '../routes/stats.js';
import { SECTOR_GROUPS } from '../lib/industry_groups.js';

const TOOL_TIMEOUT_MS = 12_000;

// Sections Bella may navigate the user to (client-side effect; the UI ignores
// anything not in this list — defense against a confused model).
export const NAV_SECTIONS = [
  'market-feed', 'signals', 'map', 'companies', 'people', 'jobs',
  'deep-data', 'crm', 'research', 'billing', 'account',
];

// ---------------------------------------------------------------------------
// In-process dispatch into a real router with the caller's auth context.
// ---------------------------------------------------------------------------

function internalCall(router, method, path, ctx, { query = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const url = path + (qs.toString() ? '?' + qs.toString() : '');

    let settled = false;
    let status = 200;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('tool timeout after ' + TOOL_TIMEOUT_MS + 'ms')); }
    }, TOOL_TIMEOUT_MS);
    const finish = (fn, arg) => { if (!settled) { settled = true; clearTimeout(timer); fn(arg); } };

    // Minimal Express-compatible req/res. Handlers in this codebase read
    // req.query/params/body/user/tenant and answer via res.json()/next(err).
    const req = {
      method,
      url,
      originalUrl: url,
      baseUrl: '',
      headers: {},
      query: Object.fromEntries(qs.entries()),
      params: {},
      body,
      user: ctx.user,
      tenant: ctx.tenant,
      get(name) { return this.headers[String(name).toLowerCase()]; },
    };
    const res = {
      statusCode: 200,
      status(c) { status = c; this.statusCode = c; return this; },
      set() { return this; },
      setHeader() { return this; },
      get() { return undefined; },
      json(obj) { finish(resolve, { status, payload: obj }); },
      send(obj) { finish(resolve, { status, payload: obj }); },
      end() { finish(resolve, { status, payload: null }); },
    };
    try {
      // A Router instance is itself a middleware function.
      router(req, res, (err) => {
        if (err) finish(reject, err);
        else finish(reject, new Error('no matching route: ' + method + ' ' + path));
      });
    } catch (err) {
      finish(reject, err);
    }
  });
}

// ---------------------------------------------------------------------------
// Result compaction — keep tool output small so turns stay fast and cheap.
// ---------------------------------------------------------------------------

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

const COMPANY_LIST_KEYS = ['id', 'name', 'city', 'industry', 'industries', 'status_normalized', 'website', 'employee_count', 'founded_year', 'bell_score'];
const COMPANY_DETAIL_KEYS = [
  'id', 'name', 'legal_name', 'city', 'address', 'industry', 'industries',
  'status_normalized', 'website', 'email', 'phone', 'linkedin_url',
  'employee_count', 'founded_year', 'description', 'bell_score',
  'people_count', 'people_locked', 'is_revealed',
];
const JOB_KEYS = ['id', 'title', 'company_name', 'company_id', 'location_text', 'employment_type', 'workplace_type', 'seniority_level', 'posted_at', 'effective_active'];
const FEED_KEYS = ['id', 'kind', 'title', 'summary', 'category', 'source_name', 'sentiment', 'occurred_at', 'url'];
const SIGNAL_KEYS = ['id', 'kind', 'title', 'body', 'company_id', 'company_name', 'occurred_at', 'importance', 'match_score', 'match_reasons'];

function sectorToIndustries(sector) {
  if (!sector) return null;
  const s = String(sector).toLowerCase();
  const g = SECTOR_GROUPS.find((x) => x.id === s || x.label.toLowerCase() === s || x.label.toLowerCase().includes(s));
  return g ? g.tags.join(',') : null;
}

// ---------------------------------------------------------------------------
// The registry. Each entry: Anthropic tool definition + executor(args, ctx).
// `requires_approval: true` entries are intercepted by the brain (G2).
// ---------------------------------------------------------------------------

export const TOOLS = [
  {
    definition: {
      name: 'search_companies',
      description: 'Search and count companies in the Bell database. Supports free-text search (names, categories like "beauty salons", CR numbers), sector/industry filters, city, and has_website. Use count_only=true for "how many" questions. Contact fields of unrevealed companies appear masked.',
      input_schema: {
        type: 'object',
        properties: {
          q:           { type: 'string', description: 'Free-text query (name, category, keyword). Optional.' },
          sector:      { type: 'string', description: 'One of the Bell sector groups: ' + SECTOR_GROUPS.map((g) => g.id + ' (' + g.label + ')').join(', ') },
          industries:  { type: 'array', items: { type: 'string' }, description: 'Exact canonical industry tags, e.g. ["Healthcare"].' },
          city:        { type: 'string' },
          has_website: { type: 'boolean' },
          status:      { type: 'string', description: 'Normalized status, e.g. "active".' },
          count_only:  { type: 'boolean', description: 'true → return only the total count (fast).' },
          limit:       { type: 'integer', description: 'Rows to return, 1–25 (default 10).' },
          offset:      { type: 'integer' },
        },
      },
    },
    async execute(args, ctx) {
      const industries = Array.isArray(args.industries) && args.industries.length
        ? args.industries.join(',')
        : sectorToIndustries(args.sector);
      const limit = args.count_only ? 1 : Math.min(Math.max(Number(args.limit) || 10, 1), 25);
      const { payload } = await internalCall(companiesRouter, 'GET', '/', ctx, {
        query: {
          q: args.q, industries, city: args.city, status: args.status,
          has_website: args.has_website === true ? '1' : (args.has_website === false ? '0' : undefined),
          limit, offset: args.offset,
        },
      });
      if (args.count_only) return { total: payload?.total ?? 0 };
      return {
        total: payload?.total ?? 0,
        showing: (payload?.rows || []).length,
        companies: (payload?.rows || []).map((r) => pick(r, COMPANY_LIST_KEYS)),
      };
    },
    summarize: (args, result) => `${result?.total ?? 0} match${args.q ? ` for "${args.q}"` : ''}${args.sector ? ` in ${args.sector}` : ''}`,
  },

  {
    definition: {
      name: 'get_company',
      description: 'Full profile of one company by id: identity, industry tags, contacts (masked unless revealed), people count (people details are restricted for customer accounts), enrichment score.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'integer', description: 'Company id from search_companies.' } },
        required: ['id'],
      },
    },
    async execute(args, ctx) {
      const { payload } = await internalCall(companiesRouter, 'GET', '/' + Number(args.id), ctx, {});
      const out = pick(payload || {}, COMPANY_DETAIL_KEYS);
      if (Array.isArray(payload?.contacts)) {
        out.contacts = payload.contacts.slice(0, 10).map((c) => pick(c, ['type', 'value', 'label', 'is_primary']));
      }
      return out;
    },
    summarize: (args, result) => result?.name ? `opened ${result.name}` : `company #${args.id}`,
  },

  {
    definition: {
      name: 'search_jobs',
      description: 'Search job postings: free text, employment type, workplace, seniority, recency, or all jobs of one company.',
      input_schema: {
        type: 'object',
        properties: {
          q:                  { type: 'string' },
          type:               { type: 'string', description: 'Employment type, e.g. Full-time.' },
          workplace:          { type: 'string', description: 'On-site / Remote / Hybrid.' },
          seniority:          { type: 'string' },
          posted_within_days: { type: 'integer' },
          company_id:         { type: 'integer' },
          limit:              { type: 'integer', description: '1–25 (default 10).' },
        },
      },
    },
    async execute(args, ctx) {
      const { payload } = await internalCall(jobsRouter, 'GET', '/', ctx, {
        query: {
          q: args.q, type: args.type, workplace: args.workplace, seniority: args.seniority,
          posted_within_days: args.posted_within_days, company_id: args.company_id,
          limit: Math.min(Math.max(Number(args.limit) || 10, 1), 25),
        },
      });
      return {
        total: payload?.total ?? (payload?.rows || []).length,
        jobs: (payload?.rows || []).map((r) => pick(r, JOB_KEYS)),
      };
    },
    summarize: (args, result) => `${result?.total ?? 0} job${(result?.total ?? 0) === 1 ? '' : 's'}${args.q ? ` for "${args.q}"` : ''}`,
  },

  {
    definition: {
      name: 'get_market_feed',
      description: 'Latest Qatar market news from the Bell feed (Bell-written summaries). Filter by category or free text.',
      input_schema: {
        type: 'object',
        properties: {
          q:        { type: 'string' },
          category: { type: 'string' },
          limit:    { type: 'integer', description: '1–15 (default 8).' },
        },
      },
    },
    async execute(args, ctx) {
      const { payload } = await internalCall(feedRouter, 'GET', '/', ctx, {
        query: { q: args.q, category: args.category, limit: Math.min(Math.max(Number(args.limit) || 8, 1), 15) },
      });
      const items = payload?.events || payload?.items || payload?.rows || [];
      return { items: items.map((r) => pick(r, FEED_KEYS)) };
    },
    summarize: (args, result) => `${(result?.items || []).length} news items`,
  },

  {
    definition: {
      name: 'get_signals',
      description: 'Live business signals (hiring, newly licensed, partnerships, leadership changes, news events). scope="icp" personalizes by the user\'s ICP profile.',
      input_schema: {
        type: 'object',
        properties: {
          window: { type: 'string', description: '24h | 3d | 7d | 14d (default 7d).' },
          kind:   { type: 'string', description: 'hiring | newly_licensed | partnership | leadership | news_event' },
          scope:  { type: 'string', description: 'global (default) or icp.' },
          limit:  { type: 'integer', description: '1–20 (default 10).' },
        },
      },
    },
    async execute(args, ctx) {
      const { payload } = await internalCall(signalsRouter, 'GET', '/', ctx, {
        query: { window: args.window, kind: args.kind, scope: args.scope, limit: Math.min(Math.max(Number(args.limit) || 10, 1), 20) },
      });
      const rows = payload?.signals || payload?.rows || [];
      return {
        icp_missing: payload?.icp_missing || false,
        signals: rows.slice(0, 20).map((r) => pick(r, SIGNAL_KEYS)),
      };
    },
    summarize: (args, result) => `${(result?.signals || []).length} signals (${args.scope || 'global'})`,
  },

  {
    definition: {
      name: 'get_data_stats',
      description: 'Platform-wide data statistics: total/active companies, people count, jobs, deep-data datasets.',
      input_schema: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      const { payload } = await internalCall(statsRouter, 'GET', '/', ctx, {});
      return payload || {};
    },
    summarize: () => 'data statistics',
  },

  {
    definition: {
      name: 'get_credits',
      description: "The user's credit balance, plan, and monthly allotment.",
      input_schema: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      const { payload } = await internalCall(creditsRouter, 'GET', '/', ctx, {});
      return pick(payload || {}, ['balance', 'plan', 'monthly_allotment', 'unlimited']);
    },
    summarize: (_a, result) => result?.unlimited ? 'credits: unlimited' : `credits: ${result?.balance ?? '?'}`,
  },

  {
    definition: {
      name: 'get_icp',
      description: "The user's saved Company & ICP profile (what they sell, target industries/sizes/titles). Use it to personalize suggestions.",
      input_schema: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      const { payload } = await internalCall(icpRouter, 'GET', '/', ctx, {});
      return payload?.profile || {};
    },
    summarize: () => 'ICP profile',
  },

  {
    definition: {
      name: 'navigate',
      description: 'Move the user\'s portal to a section. Use when they ask to see or go somewhere. Sections: ' + NAV_SECTIONS.join(', ') + '.',
      input_schema: {
        type: 'object',
        properties: { section: { type: 'string', description: 'One of: ' + NAV_SECTIONS.join(', ') } },
        required: ['section'],
      },
    },
    // Client-side effect — the brain special-cases this (emits an SSE event);
    // execute() is the fallback answer the model sees.
    async execute(args) {
      const section = String(args.section || '').toLowerCase();
      if (!NAV_SECTIONS.includes(section)) return { error: 'unknown section', valid: NAV_SECTIONS };
      return { ok: true, navigated: section };
    },
    summarize: (args) => `→ ${args.section}`,
    clientEffect: 'navigate',
  },
];

export const TOOL_DEFINITIONS = TOOLS.map((t, i) => {
  const def = { ...t.definition };
  // Prompt-caching breakpoint on the LAST tool definition: tools + system are
  // stable across turns, so every turn after the first reads them from cache.
  if (i === TOOLS.length - 1) def.cache_control = { type: 'ephemeral' };
  return def;
});

const BY_NAME = new Map(TOOLS.map((t) => [t.definition.name, t]));

export function getTool(name) {
  return BY_NAME.get(name) || null;
}

/** Runs a tool with the caller's auth context. Never throws — errors become
 *  a result the model can read and recover from. */
export async function executeTool(name, args, ctx) {
  const tool = BY_NAME.get(name);
  if (!tool) return { result: { error: 'unknown tool: ' + name }, summary: 'unknown tool', isError: true };
  try {
    const result = await tool.execute(args || {}, ctx);
    const summary = (() => { try { return tool.summarize(args || {}, result); } catch { return name; } })();
    return { result, summary, isError: false };
  } catch (err) {
    return { result: { error: String(err.message || err).slice(0, 300) }, summary: 'failed: ' + String(err.message || '').slice(0, 80), isError: true };
  }
}
