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
import peopleRouter    from '../routes/people.js';
import jobsRouter      from '../routes/jobs.js';
import feedRouter      from '../routes/feed.js';
import signalsRouter   from '../routes/signals.js';
import creditsRouter   from '../routes/credits.js';
import icpRouter       from '../routes/icp.js';
import statsRouter     from '../routes/stats.js';
import crmRouter       from '../routes/crm.js';
import whatsappRouter  from '../routes/whatsapp.js';
import accountRouter   from '../routes/account.js';
import billingRouter   from '../routes/billing.js';
import openDataRouter  from '../routes/open_data.js';
import publicNewsRouter from '../routes/public_news.js';
import { SECTOR_GROUPS } from '../lib/industry_groups.js';
import * as store from './store.js';

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
      // Some routers (billing) re-check auth per-route: forward the caller's
      // own bearer token so those gates verify the SAME user.
      headers: ctx.authHeader ? { authorization: ctx.authHeader } : {},
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
const CRM_ROW_KEYS = ['id', 'entity_type', 'entity_id', 'status', 'company_name', 'company_city', 'company_industry', 'person_name', 'owner_email', 'last_activity_at'];

/** Route responses resolve even on 4xx — turn those into model-readable errors. */
function asResult(status, payload, okKeys = null) {
  if (status >= 400 || (payload && payload.error)) {
    return { error: String(payload?.reason || payload?.error || ('HTTP ' + status)).slice(0, 300) };
  }
  return okKeys ? pick(payload || {}, okKeys) : (payload || {});
}
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
      name: 'get_news',
      description: 'Qatar business news the Bell newsroom has written up as full articles. List the latest (optionally by category or a free-text filter), or pass id to read one article in full (with its body). Categories: economic, political, corporate, energy, real_estate, tech, legal, sports, other.',
      input_schema: {
        type: 'object',
        properties: {
          id:       { type: 'integer', description: 'Read one article in full (title + summary + body).' },
          category: { type: 'string' },
          q:        { type: 'string', description: 'Free-text filter over titles/summaries.' },
          limit:    { type: 'integer', description: '1–15 (default 8).' },
        },
      },
    },
    async execute(args, ctx) {
      if (args.id) {
        const { payload } = await internalCall(publicNewsRouter, 'GET', '/' + Number(args.id), ctx, {});
        const it = payload?.item || payload || {};
        return pick(it, ['id', 'title', 'summary', 'body', 'category', 'source_name', 'url', 'published_at']);
      }
      const { payload } = await internalCall(publicNewsRouter, 'GET', '/', ctx, {
        query: { category: args.category, limit: Math.min(Math.max(Number(args.limit) || 8, 1), 15) },
      });
      let items = payload?.items || payload?.rows || [];
      if (args.q) {
        const s = String(args.q).toLowerCase();
        items = items.filter((n) => ((n.title || '') + ' ' + (n.summary || '')).toLowerCase().includes(s));
      }
      return { items: items.slice(0, 15).map((n) => pick(n, ['id', 'title', 'summary', 'category', 'source_name', 'url', 'published_at'])) };
    },
    summarize: (args, r) => (args.id ? 'opened article' : `${(r?.items || []).length} news articles`),
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

  // ==========================================================================
  // G2 — CRM reads (no approval)
  // ==========================================================================
  {
    definition: {
      name: 'get_crm_records',
      description: "The user's CRM pipeline: list records with optional search, status (new|contacted|engaged|won|lost) and entity_type filters.",
      input_schema: {
        type: 'object',
        properties: {
          q:           { type: 'string' },
          status:      { type: 'string', description: 'new | contacted | engaged | won | lost' },
          entity_type: { type: 'string', description: 'company | person' },
          limit:       { type: 'integer', description: '1–50 (default 15).' },
        },
      },
    },
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'GET', '/records', ctx, {
        query: { q: args.q, status: args.status, entity_type: args.entity_type, limit: Math.min(Math.max(Number(args.limit) || 15, 1), 50) },
      });
      const r = asResult(status, payload);
      if (r.error) return r;
      return { total: payload.total, records: (payload.rows || []).map((x) => pick(x, CRM_ROW_KEYS)) };
    },
    summarize: (_a, r) => r?.error ? 'failed' : `${r?.total ?? 0} CRM records`,
  },

  {
    definition: {
      name: 'get_crm_record',
      description: 'One CRM record in full: notes, tasks, emails, deals, sequence enrollments, WhatsApp thread size.',
      input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'GET', '/' + 'records/' + Number(args.id), ctx, {});
      const r = asResult(status, payload);
      if (r.error) return r;
      return {
        record: pick(payload.record || {}, CRM_ROW_KEYS),
        notes: (payload.notes || []).slice(0, 5).map((n) => pick(n, ['id', 'body', 'author_email', 'created_at'])),
        tasks: (payload.tasks || []).slice(0, 10).map((t) => pick(t, ['id', 'title', 'due_at', 'status'])),
        emails: (payload.emails || []).slice(0, 5).map((e) => pick(e, ['id', 'direction', 'subject', 'status', 'created_at'])),
        deals: (payload.deals || []).map((d) => pick(d, ['id', 'title', 'value_num', 'currency', 'status', 'stage_name'])),
        enrollments: (payload.enrollments || []).map((e) => pick(e, ['id', 'sequence_name', 'current_step', 'total_steps', 'status'])),
        whatsapp_messages: (payload.whatsapp || []).length,
        suggested_to: payload.suggested_to || null,
        suggested_wa: payload.suggested_wa || null,
        can_send: !!payload.can_send,
      };
    },
    summarize: (args, r) => r?.error ? 'failed' : `record #${args.id}${r?.record?.company_name ? ' — ' + r.record.company_name : ''}`,
  },

  {
    definition: {
      name: 'get_sequences',
      description: "The user's email sequences (name, steps, active enrollments).",
      input_schema: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'GET', '/sequences', ctx, {});
      const r = asResult(status, payload);
      if (r.error) return r;
      return { sequences: (payload.rows || []).map((s) => pick(s, ['id', 'name', 'status', 'step_count', 'active_enrollments'])) };
    },
    summarize: (_a, r) => r?.error ? 'failed' : `${(r?.sequences || []).length} sequences`,
  },

  {
    definition: {
      name: 'get_whatsapp_thread',
      description: 'Read the WhatsApp conversation attached to a CRM record.',
      input_schema: { type: 'object', properties: { record_id: { type: 'integer' } }, required: ['record_id'] },
    },
    async execute(args, ctx) {
      const { status, payload } = await internalCall(whatsappRouter, 'GET', '/thread', ctx, { query: { record_id: Number(args.record_id) } });
      const r = asResult(status, payload);
      if (r.error) return r;
      return { messages: (payload.rows || []).slice(-20).map((m) => pick(m, ['direction', 'body', 'status', 'created_at'])) };
    },
    summarize: (args, r) => r?.error ? 'failed' : `WhatsApp thread of record #${args.record_id}`,
  },

  {
    definition: {
      name: 'list_scheduled_tasks',
      description: "The user's scheduled Bella tasks (overnight work queue).",
      input_schema: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      const rows = await store.listTasks(ctx.tenant.id, ctx.user?.id ?? 0, 20);
      return { tasks: rows.map((t) => pick(t, ['id', 'instruction', 'run_at', 'status'])) };
    },
    summarize: (_a, r) => `${(r?.tasks || []).length} scheduled tasks`,
  },

  // ==========================================================================
  // G2.3 — full-dashboard coverage (Val 2026-07-03: "absolutely everything").
  // ==========================================================================
  {
    definition: {
      name: 'search_people',
      description: 'Search decision-makers/people: free text, employer name, or company_id. NOTE: customer accounts get counts only (Qatar PDPPL lockdown) — the result says locked:true; explain and pivot to companies. Admin accounts get full rows.',
      input_schema: {
        type: 'object',
        properties: {
          q:          { type: 'string' },
          company:    { type: 'string', description: 'Employer name filter.' },
          company_id: { type: 'integer' },
          limit:      { type: 'integer', description: '1–25 (default 10).' },
        },
      },
    },
    async execute(args, ctx) {
      const { status, payload } = await internalCall(peopleRouter, 'GET', '/', ctx, {
        query: { q: args.q, company: args.company, company_id: args.company_id, limit: Math.min(Math.max(Number(args.limit) || 10, 1), 25) },
      });
      const r = asResult(status, payload);
      if (r.error) return r;
      if (payload.locked) {
        return { locked: true, total: payload.total ?? 0, note: 'Person-level details are restricted for customer accounts under Qatar PDPPL — counts only. Company-level intelligence is fully available.' };
      }
      return {
        total: payload.total ?? 0,
        people: (payload.rows || []).map((p) => pick(p, ['id', 'full_name', 'headline', 'title', 'seniority', 'company_name', 'city', 'email', 'phone', 'linkedin_url', 'is_revealed'])),
      };
    },
    summarize: (args, r) => r?.locked ? `people locked (${r.total} exist)` : `${r?.total ?? 0} people${args.q ? ` for "${args.q}"` : ''}`,
  },

  {
    definition: {
      name: 'get_billing',
      description: "The user's billing picture: subscription/plan status, usage, and recent invoices. Read-only.",
      input_schema: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      const [sub, usage, inv] = await Promise.all([
        internalCall(billingRouter, 'GET', '/subscription', ctx, {}).catch((e) => ({ status: 500, payload: { error: e.message } })),
        internalCall(billingRouter, 'GET', '/usage', ctx, {}).catch((e) => ({ status: 500, payload: { error: e.message } })),
        internalCall(billingRouter, 'GET', '/invoices', ctx, {}).catch((e) => ({ status: 500, payload: { error: e.message } })),
      ]);
      const invoices = inv.payload?.rows || inv.payload?.invoices || (Array.isArray(inv.payload) ? inv.payload : []);
      return {
        subscription: asResult(sub.status, sub.payload),
        usage: asResult(usage.status, usage.payload),
        invoices: invoices.slice(0, 5).map((i) => pick(i, ['id', 'number', 'status', 'amount', 'amount_due', 'total', 'currency', 'created', 'date', 'hosted_invoice_url', 'url'])),
      };
    },
    summarize: () => 'billing overview',
  },

  {
    definition: {
      name: 'list_email_templates',
      description: "The workspace's saved email templates.",
      input_schema: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'GET', '/templates', ctx, {});
      const r = asResult(status, payload);
      if (r.error) return r;
      const rows = payload.rows || payload.templates || (Array.isArray(payload) ? payload : []);
      return { templates: rows.slice(0, 25).map((t) => pick(t, ['id', 'name', 'subject'])) };
    },
    summarize: (_a, r) => `${(r?.templates || []).length} templates`,
  },

  {
    approval: 'act',
    definition: {
      name: 'create_email_template',
      description: 'Save a reusable email template ({tokens} like {company} supported).',
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
        required: ['name', 'subject', 'body'],
      },
    },
    describe: (args) => `Save email template "${String(args.name || '').slice(0, 50)}"`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'POST', '/templates', ctx, {
        body: { name: String(args.name || ''), subject: args.subject || null, body: args.body || null },
      });
      return asResult(status, payload, ['id', 'name']);
    },
    summarize: (_a, r) => r?.error ? 'failed' : `template #${r?.id} saved`,
  },

  {
    approval: 'act',
    definition: {
      name: 'update_account_prefs',
      description: "Update the user's account preferences (timezone, default landing page: companies|market-feed|crm|map) and/or notification toggles.",
      input_schema: {
        type: 'object',
        properties: {
          preferences:   { type: 'object', description: 'e.g. {"default_landing":"crm","timezone":"Asia/Qatar"}' },
          notifications: { type: 'object', description: 'boolean toggles, e.g. {"credit_low":true}' },
        },
      },
    },
    describe: (args) => `Update account settings: ${[...Object.keys(args.preferences || {}), ...Object.keys(args.notifications || {})].join(', ') || '(none)'}`,
    async execute(args, ctx) {
      const body = {};
      if (args.preferences && typeof args.preferences === 'object') body.preferences = args.preferences;
      if (args.notifications && typeof args.notifications === 'object') body.notifications = args.notifications;
      if (!Object.keys(body).length) return { error: 'nothing to update' };
      const { status, payload } = await internalCall(accountRouter, 'PATCH', '/', ctx, { body });
      const r = asResult(status, payload);
      return r.error ? r : { updated: Object.keys(body) };
    },
    summarize: (_a, r) => r?.error ? 'failed' : 'settings updated',
  },

  {
    definition: {
      name: 'search_datasets',
      description: 'Search the Deep Data section (Qatar open-data datasets) by keyword.',
      input_schema: {
        type: 'object',
        properties: { q: { type: 'string' }, limit: { type: 'integer', description: '1–20 (default 10).' } },
      },
    },
    async execute(args, ctx) {
      const { status, payload } = await internalCall(openDataRouter, 'GET', '/datasets', ctx, {
        query: { q: args.q, limit: Math.min(Math.max(Number(args.limit) || 10, 1), 20) },
      });
      const r = asResult(status, payload);
      if (r.error) return r;
      return { total: payload.total ?? 0, datasets: (payload.rows || []).map((d) => pick(d, ['id', 'title', 'name', 'theme', 'publisher', 'records_count', 'updated_at'])) };
    },
    summarize: (args, r) => `${r?.total ?? 0} datasets${args.q ? ` for "${args.q}"` : ''}`,
  },

  {
    definition: {
      name: 'get_dataset_records',
      description: 'Read rows from one Deep Data dataset (id from search_datasets), optional keyword filter.',
      input_schema: {
        type: 'object',
        properties: {
          dataset_id: { type: 'integer' }, q: { type: 'string' },
          limit: { type: 'integer', description: '1–10 (default 5 — rows can be wide).' },
        },
        required: ['dataset_id'],
      },
    },
    async execute(args, ctx) {
      const { status, payload } = await internalCall(openDataRouter, 'GET', `/datasets/${Number(args.dataset_id)}/records`, ctx, {
        query: { q: args.q, limit: Math.min(Math.max(Number(args.limit) || 5, 1), 10) },
      });
      const r = asResult(status, payload);
      if (r.error) return r;
      return { total: payload.total ?? 0, records: (payload.rows || payload.records || []).slice(0, 10) };
    },
    summarize: (args, r) => `${r?.total ?? 0} records in dataset #${args.dataset_id}`,
  },

  // ==========================================================================
  // G2 — ACTIONS. approval: 'act' (ask-mode gated) · 'spend' (credits; ask-mode
  // gated + daily cap) · 'always' (external sends — gated in EVERY mode).
  // ==========================================================================
  {
    approval: 'spend',
    definition: {
      name: 'reveal_people',
      description: 'Reveal people (unmask a person\'s verified contacts) — 1 credit each; already-revealed are free. Revealed people flow into the CRM. NOTE: person data is PDPPL-locked for customer accounts — this works for accounts with people access. Max 200.',
      input_schema: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'integer' }, description: 'Person ids from search_people.' } },
        required: ['ids'],
      },
    },
    describe: (args) => `Reveal ${(args.ids || []).length} people — up to ${(args.ids || []).length} credits (only unrevealed are charged)`,
    async execute(args, ctx) {
      const ids = (args.ids || []).map(Number).filter(Number.isFinite).slice(0, 200);
      if (!ids.length) return { error: 'ids[] required' };
      const budget = await store.checkCreditsBudget(ctx.tenant.id, ctx.user?.id ?? 0, ids.length);
      if (!budget.ok) return { error: `daily Bella credit cap would be exceeded (${budget.spent}/${budget.cap} spent today)` };
      const { status, payload } = await internalCall(peopleRouter, 'POST', '/reveal-bulk', ctx, { body: { ids } });
      const r = asResult(status, payload, ['requested', 'already', 'revealed', 'insufficient', 'charged', 'balance', 'unlimited']);
      if (!r.error) await store.addCreditsSpent(ctx.tenant.id, ctx.user?.id ?? 0, Number(payload?.charged) || 0);
      return r;
    },
    summarize: (_a, r) => r?.error ? 'failed' : (r?.unlimited ? `revealed ${r.revealed} (unlimited)` : `revealed ${r?.revealed ?? 0}, charged ${r?.charged ?? 0} credits`),
  },

  {
    approval: 'spend',
    definition: {
      name: 'reveal_companies',
      description: 'Reveal companies (unmask contacts) — costs 1 credit per company; already-revealed ones are FREE and not recharged. Revealed companies are auto-added to the CRM. Max 200 per call. State the cost before proposing.',
      input_schema: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'integer' }, description: 'Company ids from search_companies.' } },
        required: ['ids'],
      },
    },
    describe: (args) => `Reveal ${(args.ids || []).length} companies — up to ${(args.ids || []).length} credits (only unrevealed are charged; they auto-join the CRM)`,
    async execute(args, ctx) {
      const ids = (args.ids || []).map(Number).filter(Number.isFinite).slice(0, 200);
      if (!ids.length) return { error: 'ids[] required' };
      const budget = await store.checkCreditsBudget(ctx.tenant.id, ctx.user?.id ?? 0, ids.length);
      if (!budget.ok) return { error: `daily Bella credit cap would be exceeded (${budget.spent}/${budget.cap} spent today) — use a smaller batch or continue tomorrow` };
      const { status, payload } = await internalCall(companiesRouter, 'POST', '/reveal-bulk', ctx, { body: { ids } });
      const r = asResult(status, payload, ['requested', 'already', 'revealed', 'insufficient', 'charged', 'balance', 'unlimited']);
      if (!r.error) await store.addCreditsSpent(ctx.tenant.id, ctx.user?.id ?? 0, Number(payload?.charged) || 0);
      return r;
    },
    summarize: (_a, r) => r?.error ? 'failed' : (r?.unlimited ? `revealed ${r.revealed} (unlimited)` : `revealed ${r?.revealed ?? 0}, charged ${r?.charged ?? 0} credits`),
  },

  {
    approval: 'act',
    definition: {
      name: 'add_to_crm',
      description: 'Add companies to the CRM pipeline (idempotent — existing records are kept). Max 50 per call.',
      input_schema: {
        type: 'object',
        properties: { company_ids: { type: 'array', items: { type: 'integer' } } },
        required: ['company_ids'],
      },
    },
    describe: (args) => `Add ${(args.company_ids || []).length} companies to the CRM`,
    async execute(args, ctx) {
      const ids = (args.company_ids || []).map(Number).filter(Number.isFinite).slice(0, 50);
      if (!ids.length) return { error: 'company_ids[] required' };
      let created = 0, existing = 0, failed = 0;
      const record_ids = [];
      for (const id of ids) {
        const { status, payload } = await internalCall(crmRouter, 'POST', '/records', ctx, { body: { entity_type: 'company', entity_id: id } });
        if (status >= 400 || payload?.error) { failed++; continue; }
        record_ids.push(payload.id);
        if (payload.created) created++; else existing++;
      }
      return { created, already_in_crm: existing, failed, record_ids: record_ids.slice(0, 50) };
    },
    summarize: (_a, r) => `CRM: +${r?.created ?? 0} new, ${r?.already_in_crm ?? 0} existing${r?.failed ? `, ${r.failed} failed` : ''}`,
  },

  {
    approval: 'act',
    definition: {
      name: 'add_crm_note',
      description: 'Add a note to a CRM record.',
      input_schema: {
        type: 'object',
        properties: { record_id: { type: 'integer' }, note: { type: 'string' } },
        required: ['record_id', 'note'],
      },
    },
    describe: (args) => `Add a note to CRM record #${args.record_id}: "${String(args.note || '').slice(0, 80)}"`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'POST', `/records/${Number(args.record_id)}/notes`, ctx, { body: { body: String(args.note || '') } });
      return asResult(status, payload, ['id', 'created_at']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `note added to #${args.record_id}`,
  },

  {
    approval: 'act',
    definition: {
      name: 'add_crm_task',
      description: 'Create a follow-up task on a CRM record.',
      input_schema: {
        type: 'object',
        properties: {
          record_id: { type: 'integer' }, title: { type: 'string' },
          description: { type: 'string' }, due_at: { type: 'string', description: 'ISO datetime (optional).' },
        },
        required: ['record_id', 'title'],
      },
    },
    describe: (args) => `Create task on record #${args.record_id}: "${String(args.title || '').slice(0, 80)}"`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'POST', `/records/${Number(args.record_id)}/tasks`, ctx, {
        body: { title: String(args.title || ''), description: args.description || null, due_at: args.due_at || null },
      });
      return asResult(status, payload, ['id', 'title', 'due_at', 'status']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `task created on #${args.record_id}`,
  },

  {
    approval: 'act',
    definition: {
      name: 'set_crm_status',
      description: 'Change a CRM record status: new | contacted | engaged | won | lost.',
      input_schema: {
        type: 'object',
        properties: { record_id: { type: 'integer' }, status: { type: 'string' } },
        required: ['record_id', 'status'],
      },
    },
    describe: (args) => `Set CRM record #${args.record_id} status → ${args.status}`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'PATCH', `/records/${Number(args.record_id)}`, ctx, { body: { status: String(args.status || '') } });
      return asResult(status, payload, ['id', 'status']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `#${args.record_id} → ${r?.status}`,
  },

  {
    approval: 'act',
    definition: {
      name: 'create_deal',
      description: 'Create a deal (optionally attached to a CRM record).',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' }, record_id: { type: 'integer' },
          value_num: { type: 'number' }, currency: { type: 'string', description: 'Default QAR.' },
          expected_close: { type: 'string', description: 'ISO date (optional).' },
        },
        required: ['title'],
      },
    },
    describe: (args) => `Create deal "${String(args.title || '').slice(0, 60)}"${args.value_num ? ` (${args.value_num} ${args.currency || 'QAR'})` : ''}`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'POST', '/deals', ctx, {
        body: { title: String(args.title || ''), record_id: args.record_id || null, value_num: args.value_num, currency: args.currency, expected_close: args.expected_close || null },
      });
      return asResult(status, payload, ['id']);
    },
    summarize: (_a, r) => r?.error ? 'failed' : `deal #${r?.id} created`,
  },

  {
    approval: 'always',
    definition: {
      name: 'send_email',
      description: "Send an email to a CRM record's contact via the workspace's sending identity. Personalization tokens like {company} are supported. ALWAYS gets user approval. Honor the user's email-style preferences when writing.",
      input_schema: {
        type: 'object',
        properties: {
          record_id: { type: 'integer' },
          subject: { type: 'string' },
          body: { type: 'string', description: 'Plain-text email body.' },
          to: { type: 'string', description: 'Override recipient (defaults to the record\'s email on file).' },
        },
        required: ['record_id', 'subject', 'body'],
      },
    },
    describe: (args) => `Send email to record #${args.record_id} — "${String(args.subject || '').slice(0, 60)}" · ${String(args.body || '').slice(0, 120)}…`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'POST', `/records/${Number(args.record_id)}/email`, ctx, {
        body: { subject: String(args.subject || ''), body: String(args.body || ''), to: args.to || undefined },
      });
      return asResult(status, payload, ['id', 'status']);
    },
    summarize: (args, r) => r?.error ? ('failed: ' + r.error) : `email sent to record #${args.record_id}`,
  },

  {
    approval: 'act',
    definition: {
      name: 'create_sequence',
      description: 'Create an email sequence (steps with delays). Enrollment is a separate step.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: { delay_days: { type: 'integer' }, subject: { type: 'string' }, body: { type: 'string' } },
              required: ['subject', 'body'],
            },
          },
        },
        required: ['name', 'steps'],
      },
    },
    describe: (args) => `Create sequence "${String(args.name || '').slice(0, 50)}" with ${(args.steps || []).length} steps`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'POST', '/sequences', ctx, {
        body: { name: String(args.name || ''), steps: (args.steps || []).slice(0, 10) },
      });
      return asResult(status, payload, ['id', 'steps']);
    },
    summarize: (_a, r) => r?.error ? 'failed' : `sequence #${r?.id} created (${r?.steps} steps)`,
  },

  {
    approval: 'always',
    definition: {
      name: 'enroll_in_sequence',
      description: 'Enroll CRM records into a sequence — this triggers automatic future emails, so it ALWAYS gets user approval. Replies auto-stop the sequence for that record.',
      input_schema: {
        type: 'object',
        properties: { record_ids: { type: 'array', items: { type: 'integer' } }, sequence_id: { type: 'integer' } },
        required: ['record_ids', 'sequence_id'],
      },
    },
    describe: (args) => `Enroll ${(args.record_ids || []).length} records into sequence #${args.sequence_id} (automatic emails will send)`,
    async execute(args, ctx) {
      const ids = (args.record_ids || []).map(Number).filter(Number.isFinite).slice(0, 100);
      const seq = Number(args.sequence_id);
      if (!ids.length || !Number.isFinite(seq)) return { error: 'record_ids[] and sequence_id required' };
      let enrolled = 0, already = 0, failed = 0; let lastError = null;
      for (const id of ids) {
        const { status, payload } = await internalCall(crmRouter, 'POST', `/records/${id}/enroll`, ctx, { body: { sequence_id: seq } });
        if (status === 409) { already++; continue; }
        if (status >= 400 || payload?.error) { failed++; lastError = payload?.reason || payload?.error; continue; }
        enrolled++;
      }
      return { enrolled, already_enrolled: already, failed, ...(lastError ? { last_error: String(lastError).slice(0, 200) } : {}) };
    },
    summarize: (_a, r) => `enrolled ${r?.enrolled ?? 0}${r?.failed ? `, ${r.failed} failed` : ''}`,
  },

  {
    approval: 'act',
    definition: {
      name: 'update_icp',
      description: "Update the user's Company & ICP profile (partial — only send fields to change). Powers personalized signals and your own suggestions.",
      input_schema: {
        type: 'object',
        properties: {
          company_name: { type: 'string' }, company_about: { type: 'string' },
          products_services: { type: 'string' }, current_customers: { type: 'string' },
          target_industries: { type: 'array', items: { type: 'string' } },
          target_sizes: { type: 'array', items: { type: 'string' } },
          target_titles: { type: 'array', items: { type: 'string' } },
          target_tech_stack: { type: 'array', items: { type: 'string' } },
          target_has_website: { type: 'string', description: 'any | has | none' },
          target_keywords: { type: 'array', items: { type: 'string' } },
          icp_notes: { type: 'string' },
        },
      },
    },
    describe: (args) => `Update ICP profile fields: ${Object.keys(args || {}).join(', ') || '(none)'}`,
    async execute(args, ctx) {
      const cur = await internalCall(icpRouter, 'GET', '/', ctx, {});
      const profile = cur.payload?.profile || {};
      const ALLOWED = ['company_name', 'company_about', 'products_services', 'current_customers', 'target_industries', 'target_sizes', 'target_titles', 'target_tech_stack', 'target_has_website', 'target_keywords', 'icp_notes'];
      const merged = { ...profile };
      for (const k of ALLOWED) if (args[k] !== undefined) merged[k] = args[k];
      const { status, payload } = await internalCall(icpRouter, 'PUT', '/', ctx, { body: merged });
      const r = asResult(status, payload);
      return r.error ? r : { updated: Object.keys(args || {}).filter((k) => ALLOWED.includes(k)) };
    },
    summarize: (_a, r) => r?.error ? 'failed' : `ICP updated (${(r?.updated || []).join(', ')})`,
  },

  {
    approval: 'always',
    definition: {
      name: 'send_whatsapp',
      description: "Send a WhatsApp message on a CRM record's thread (works within 24h of the contact's last message). ALWAYS gets user approval.",
      input_schema: {
        type: 'object',
        properties: { record_id: { type: 'integer' }, to: { type: 'string', description: 'Phone with country code.' }, body: { type: 'string' } },
        required: ['record_id', 'to', 'body'],
      },
    },
    describe: (args) => `Send WhatsApp to ${args.to} (record #${args.record_id}): "${String(args.body || '').slice(0, 80)}"`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(whatsappRouter, 'POST', '/send', ctx, {
        body: { record_id: Number(args.record_id), to: String(args.to || ''), body: String(args.body || '') },
      });
      return asResult(status, payload, ['ok', 'id', 'status']);
    },
    summarize: (args, r) => r?.error ? ('failed: ' + r.error) : `WhatsApp sent on record #${args.record_id}`,
  },

  {
    approval: 'act',
    definition: {
      name: 'update_crm_note',
      description: "Edit a note's text (note ids come from get_crm_record).",
      input_schema: {
        type: 'object',
        properties: { note_id: { type: 'integer' }, note: { type: 'string' } },
        required: ['note_id', 'note'],
      },
    },
    describe: (args) => `Edit note #${args.note_id}: "${String(args.note || '').slice(0, 80)}"`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'PATCH', `/notes/${Number(args.note_id)}`, ctx, { body: { body: String(args.note || '') } });
      return asResult(status, payload, ['id', 'body', 'updated_at']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `note #${args.note_id} edited`,
  },

  {
    approval: 'always',
    definition: {
      name: 'delete_crm_note',
      description: 'Delete a CRM note (note ids come from get_crm_record). Deletions ALWAYS get user approval.',
      input_schema: { type: 'object', properties: { note_id: { type: 'integer' } }, required: ['note_id'] },
    },
    describe: (args) => `Delete CRM note #${args.note_id} (permanent)`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'DELETE', `/notes/${Number(args.note_id)}`, ctx, {});
      return asResult(status, payload, ['ok']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `note #${args.note_id} deleted`,
  },

  {
    approval: 'act',
    definition: {
      name: 'update_crm_task',
      description: 'Edit a CRM task: retitle, reschedule, or set status open | done | cancelled.',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'integer' }, title: { type: 'string' },
          due_at: { type: 'string', description: 'ISO datetime or null to clear.' },
          status: { type: 'string', description: 'open | done | cancelled' },
        },
        required: ['task_id'],
      },
    },
    describe: (args) => `Update task #${args.task_id}${args.status ? ` → ${args.status}` : ''}${args.title ? ` ("${String(args.title).slice(0, 50)}")` : ''}`,
    async execute(args, ctx) {
      const body = {};
      if (args.title !== undefined) body.title = args.title;
      if (args.due_at !== undefined) body.due_at = args.due_at;
      if (args.status !== undefined) body.status = args.status;
      const { status, payload } = await internalCall(crmRouter, 'PATCH', `/tasks/${Number(args.task_id)}`, ctx, { body });
      return asResult(status, payload, ['id', 'title', 'due_at', 'status']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `task #${args.task_id} updated`,
  },

  {
    approval: 'always',
    definition: {
      name: 'delete_crm_task',
      description: 'Delete a CRM task. Deletions ALWAYS get user approval.',
      input_schema: { type: 'object', properties: { task_id: { type: 'integer' } }, required: ['task_id'] },
    },
    describe: (args) => `Delete CRM task #${args.task_id} (permanent)`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'DELETE', `/tasks/${Number(args.task_id)}`, ctx, {});
      return asResult(status, payload, ['ok']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `task #${args.task_id} deleted`,
  },

  {
    approval: 'act',
    definition: {
      name: 'update_deal',
      description: 'Edit a deal: title, value, currency, expected close date.',
      input_schema: {
        type: 'object',
        properties: {
          deal_id: { type: 'integer' }, title: { type: 'string' },
          value_num: { type: 'number' }, currency: { type: 'string' },
          expected_close: { type: 'string', description: 'ISO date or null to clear.' },
        },
        required: ['deal_id'],
      },
    },
    describe: (args) => `Update deal #${args.deal_id}${args.title ? ` ("${String(args.title).slice(0, 50)}")` : ''}${args.value_num !== undefined ? ` value ${args.value_num}` : ''}`,
    async execute(args, ctx) {
      const body = {};
      for (const k of ['title', 'value_num', 'currency', 'expected_close']) if (args[k] !== undefined) body[k] = args[k];
      const { status, payload } = await internalCall(crmRouter, 'PATCH', `/deals/${Number(args.deal_id)}`, ctx, { body });
      return asResult(status, payload, ['id', 'status', 'value_num']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `deal #${args.deal_id} updated`,
  },

  {
    approval: 'always',
    definition: {
      name: 'delete_deal',
      description: 'Delete a deal. Deletions ALWAYS get user approval.',
      input_schema: { type: 'object', properties: { deal_id: { type: 'integer' } }, required: ['deal_id'] },
    },
    describe: (args) => `Delete deal #${args.deal_id} (permanent)`,
    async execute(args, ctx) {
      const { status, payload } = await internalCall(crmRouter, 'DELETE', `/deals/${Number(args.deal_id)}`, ctx, {});
      return asResult(status, payload, ['ok']);
    },
    summarize: (args, r) => r?.error ? 'failed' : `deal #${args.deal_id} deleted`,
  },

  {
    approval: 'act',
    definition: {
      name: 'schedule_task',
      description: 'Schedule Bella to do work later ("have this ready by tomorrow morning"). The run executes FULLY AUTONOMOUSLY at the set time — no approvals are asked then, because the user\'s approval of the schedule counts as approval for everything in it. So your proposal MUST disclose any emails/WhatsApp it will send and any credits it will spend. Results land in this conversation + a notification; the user can cancel queued tasks in Settings → Bella.',
      input_schema: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'What to do, self-contained.' },
          run_at: { type: 'string', description: 'ISO datetime. Alternative: delay_hours.' },
          delay_hours: { type: 'number' },
        },
        required: ['instruction'],
      },
    },
    describe: (args) => `Schedule: "${String(args.instruction || '').slice(0, 100)}" at ${args.run_at || `+${args.delay_hours || '?'}h`} — runs autonomously, no further approvals (approving this IS the approval; daily credit caps still apply)`,
    async execute(args, ctx) {
      const instruction = String(args.instruction || '').trim();
      if (!instruction) return { error: 'instruction required' };
      let runAt = args.run_at ? new Date(args.run_at) : new Date(Date.now() + (Number(args.delay_hours) || 1) * 3600_000);
      if (isNaN(runAt.getTime())) return { error: 'invalid run_at' };
      const now = Date.now();
      if (runAt.getTime() < now) return { error: 'run_at is in the past' };
      if (runAt.getTime() > now + 14 * 86400_000) return { error: 'max 14 days ahead' };
      const t = await store.createTask(ctx.tenant.id, ctx.user?.id ?? 0, ctx.conversationId || null, instruction, runAt.toISOString());
      return { task_id: t.id, run_at: t.run_at };
    },
    summarize: (_a, r) => r?.error ? 'failed' : `task #${r?.task_id} scheduled`,
  },

  {
    approval: 'act',
    definition: {
      name: 'cancel_scheduled_task',
      description: 'Cancel one of the user\'s queued Bella tasks.',
      input_schema: { type: 'object', properties: { task_id: { type: 'integer' } }, required: ['task_id'] },
    },
    describe: (args) => `Cancel scheduled task #${args.task_id}`,
    async execute(args, ctx) {
      const ok = await store.cancelTask(ctx.tenant.id, ctx.user?.id ?? 0, Number(args.task_id));
      return ok ? { cancelled: true } : { error: 'not found or not cancellable' };
    },
    summarize: (args, r) => r?.error ? 'failed' : `task #${args.task_id} cancelled`,
  },

  // ── Bella acts on the UI ────────────────────────────────────────────────
  // These tools DRIVE the portal instead of only describing data: they open a
  // record, filter a grid, or type into a field via a client-side ui_action
  // (brain.js forwards it; ui/lib/bellaBus.js + the tabs apply it).
  {
    definition: {
      name: 'show_companies',
      description: 'OPEN the Companies view in the app, filtered so the user actually SEES the matching companies on screen. Use whenever the user wants to look at, browse, or filter companies ("show me construction companies in Doha", "pull up companies with a website", "list marketing agencies"). This drives the real UI. For a pure count or a fact you will simply state, use search_companies instead.',
      input_schema: {
        type: 'object',
        properties: {
          q:           { type: 'string', description: 'Free-text search (name, category, keyword).' },
          sector:      { type: 'string', description: 'One Bell sector group id: ' + SECTOR_GROUPS.map((g) => g.id).join(', ') },
          industries:  { type: 'array', items: { type: 'string' }, description: 'Exact canonical industry tags, e.g. ["Healthcare"].' },
          city:        { type: 'string' },
          has_website: { type: 'boolean' },
          status:      { type: 'string', description: 'Normalized status, e.g. "active".' },
        },
      },
    },
    async execute(args, ctx) {
      const industries = Array.isArray(args.industries) && args.industries.length
        ? args.industries.join(',') : sectorToIndustries(args.sector);
      const { payload } = await internalCall(companiesRouter, 'GET', '/', ctx, {
        query: {
          q: args.q, industries, city: args.city, status: args.status,
          has_website: args.has_website === true ? '1' : (args.has_website === false ? '0' : undefined),
          limit: 6,
        },
      });
      return {
        total: payload?.total ?? 0,
        showing_in_app: true,
        companies: (payload?.rows || []).map((r) => pick(r, COMPANY_LIST_KEYS)),
      };
    },
    summarize: (args, r) => `showing ${r?.total ?? 0} companies in the app`,
    uiAction: (args) => {
      const industries = Array.isArray(args.industries) && args.industries.length
        ? args.industries
        : (sectorToIndustries(args.sector) ? sectorToIndustries(args.sector).split(',') : []);
      return {
        type: 'show_companies',
        q: args.q || '',
        filters: {
          industries,
          statuses: args.status ? [String(args.status)] : [],
          city: args.city || '',
          website: args.has_website === true ? 'has' : (args.has_website === false ? 'none' : ''),
        },
      };
    },
  },

  {
    definition: {
      name: 'open_company',
      description: 'OPEN one company\'s full profile in the app so the user sees it. Accepts the company id (from search_companies/show_companies) or, if you only have the name, the name to resolve. Use for "open Ooredoo", "show me that company", "pull up its profile".',
      input_schema: {
        type: 'object',
        properties: {
          id:   { type: 'integer', description: 'Company id (preferred).' },
          name: { type: 'string', description: 'Company name to resolve when you have no id.' },
        },
      },
    },
    async execute(args, ctx) {
      let id = Number(args.id) || null;
      if (!id && args.name) {
        const { payload } = await internalCall(companiesRouter, 'GET', '/', ctx, { query: { q: args.name, limit: 1 } });
        const top = (payload?.rows || [])[0];
        if (top) id = top.id;
      }
      if (!id) return { error: 'no matching company — try search_companies first' };
      const { payload } = await internalCall(companiesRouter, 'GET', '/' + id, ctx, {});
      const out = pick(payload || {}, COMPANY_DETAIL_KEYS);
      out._resolved_id = id;
      return out;
    },
    summarize: (args, r) => r?.name ? `opened ${r.name}` : (r?._resolved_id ? `opened company #${r._resolved_id}` : 'no match'),
    uiAction: (args, r) => (r && r._resolved_id ? { type: 'open_record', tab: 'companies', id: r._resolved_id } : null),
  },

  {
    definition: {
      name: 'show_people',
      description: 'OPEN the People view filtered so the user sees the matching decision-makers on screen. Use for "show me people at Ooredoo", "find marketing managers". People contact details are restricted for customer accounts until revealed.',
      input_schema: {
        type: 'object',
        properties: {
          q:       { type: 'string', description: 'Free-text (name, title, keyword).' },
          company: { type: 'string', description: 'Employer name to filter by.' },
        },
      },
    },
    async execute(args, ctx) {
      const { payload } = await internalCall(peopleRouter, 'GET', '/', ctx, {
        query: { q: args.q, company: args.company, limit: 6 },
      });
      return { total: payload?.total ?? (payload?.rows || []).length, showing_in_app: true };
    },
    summarize: (args, r) => `showing ${r?.total ?? 0} people in the app`,
    uiAction: (args) => ({ type: 'show_people', q: args.q || '', company: args.company || '' }),
  },

  {
    definition: {
      name: 'open_person',
      description: 'OPEN one person\'s profile in the app by id (from show_people/search_people).',
      input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    },
    async execute(args) {
      const id = Number(args.id) || null;
      if (!id) return { error: 'need a person id' };
      return { ok: true, opened: id };
    },
    summarize: (args) => `opened person #${args.id}`,
    uiAction: (args) => (Number(args.id) ? { type: 'open_record', tab: 'people', id: Number(args.id) } : null),
  },

  {
    definition: {
      name: 'fill_field',
      description: 'TYPE a value into a form field the user is looking at, exactly as if they typed it — Settings, ICP profile, CRM, research, filters, anything on screen. Identify the field by its visible label or placeholder (e.g. "Company name", "Website", "note"). Only fills what is currently visible, so navigate/open the right view first. After filling, tell the user what you set and let them review and save — never claim it is saved.',
      input_schema: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'The field\'s visible label or placeholder, e.g. "Company name".' },
          value: { type: 'string', description: 'The text to put in it.' },
        },
        required: ['field', 'value'],
      },
    },
    async execute(args) {
      if (!args.field) return { error: 'need a field label' };
      return { ok: true, field: String(args.field), value: String(args.value ?? '') };
    },
    summarize: (args) => `filled "${String(args.field || '').slice(0, 40)}"`,
    uiAction: (args) => ({ type: 'fill_field', field: String(args.field || ''), value: String(args.value ?? '') }),
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

/**
 * Approval matrix (Val's D2, locked 2026-07-03):
 *   'act' / 'spend' → gated in ask mode, free in auto mode
 *   'always'        → gated in EVERY mode (external sends / auto-email triggers)
 *   (reads carry no approval field and never gate)
 */
export function requiresApproval(tool, approvalMode) {
  const a = tool?.approval;
  if (!a) return false;
  if (a === 'always') return true;
  return approvalMode !== 'auto';
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
