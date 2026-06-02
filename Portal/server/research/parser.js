// Convert a Firecrawl Agent JSON payload into research_reports +
// research_sources + research_citations rows.
//
// Defensive: agents drift, so we treat the response as untrusted JSON and
// repair common shapes (string-encoded JSON, sections-as-object, missing
// indexes) rather than throwing.

/**
 * Persist a Firecrawl Agent payload for one job.
 * @param client  — pg client in an open transaction
 * @param jobId   — bigint research_jobs.id
 * @param payload — the `data` object Firecrawl Agent returned
 * @returns { report_id, source_count, section_count, citation_count }
 */
export async function persistReport(client, jobId, payload) {
  const obj = normalizeAgentPayload(payload);
  const title    = String(obj.title || '').trim() || 'Untitled research report';
  const summary  = String(obj.summary || '').trim() || null;
  const sections = Array.isArray(obj.sections) ? obj.sections : [];
  const sources  = Array.isArray(obj.sources)  ? obj.sources  : [];

  // 1) Persist sources first — we need their PK ids to write citations
  const sourceIdByIndex = new Map();  // 1-based index → db id
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i] || {};
    const klass = SOURCE_CLASSES.has(String(s.class)) ? String(s.class) : 'web';
    const r = await client.query(`
      INSERT INTO research_sources (job_id, class, label, url, excerpt)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      jobId,
      klass,
      str(s.label, 240),
      str(s.url, 1024),
      str(s.excerpt, 2000),
    ]);
    sourceIdByIndex.set(i + 1, Number(r.rows[0].id));
  }

  // 2) Persist the report (sections jsonb stores body + indexes; we'll also
  //    write each (section, source) pair to research_citations for fast lookup)
  const normalizedSections = sections.map((s, i) => ({
    number:        Number.isFinite(s?.number) ? Number(s.number) : (i + 1),
    title:         String(s?.title || `Section ${i + 1}`).slice(0, 240),
    body_markdown: String(s?.body_markdown || s?.body || '').slice(0, 64_000),
    source_indexes: Array.isArray(s?.source_indexes)
      ? s.source_indexes.map(Number).filter(n => Number.isInteger(n))
      : extractInlineCiteIndexes(String(s?.body_markdown || s?.body || '')),
  }));

  const reportR = await client.query(`
    INSERT INTO research_reports (job_id, title, summary, sections, metadata, assembled_at, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, now(), now())
    ON CONFLICT (job_id) DO UPDATE
       SET title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           sections = EXCLUDED.sections,
           metadata = EXCLUDED.metadata,
           updated_at = now()
    RETURNING id
  `, [
    jobId,
    title,
    summary,
    JSON.stringify(normalizedSections),
    JSON.stringify({ payload_keys: Object.keys(obj) }),
  ]);
  const reportId = Number(reportR.rows[0].id);

  // 3) Citations — one row per (section, source) pair we can resolve
  let citationCount = 0;
  for (const sec of normalizedSections) {
    const seenInThisSection = new Set();
    for (const idx of sec.source_indexes) {
      if (seenInThisSection.has(idx)) continue;
      seenInThisSection.add(idx);
      const sourceId = sourceIdByIndex.get(idx);
      if (!sourceId) continue;
      await client.query(`
        INSERT INTO research_citations (report_id, source_id, section_number, anchor_text)
        VALUES ($1, $2, $3, $4)
      `, [reportId, sourceId, sec.number, '[' + idx + ']']);
      citationCount++;
    }
  }

  return {
    report_id:      reportId,
    source_count:   sources.length,
    section_count:  normalizedSections.length,
    citation_count: citationCount,
    // Accept either the new flat shape (derived_companies/derived_people at
    // top level — easier for the agent to fill) OR the old nested shape
    // (derived_entities.{companies, people}). ingest.js consumes {companies,
    // people} so we normalize here.
    derived_entities: {
      companies: Array.isArray(obj.derived_companies) ? obj.derived_companies
        : (obj.derived_entities?.companies || []),
      people: Array.isArray(obj.derived_people) ? obj.derived_people
        : (obj.derived_entities?.people || []),
    },
    // Structured facts about the target company (rich research data model).
    facts: {
      financials:   Array.isArray(obj.financials)   ? obj.financials   : [],
      shareholders: Array.isArray(obj.shareholders) ? obj.shareholders : [],
      partnerships: Array.isArray(obj.partnerships) ? obj.partnerships : [],
    },
  };
}

const SOURCE_CLASSES = new Set(['filing','press','graph','industry','academic','court','web','other']);

function str(v, max) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Firecrawl Agent v2 returns the extracted data wrapped in various layers
 * depending on whether the call was strict-schema, free-form, or partial.
 * Recurse breadth-first through the object tree and return the first node
 * that looks like our report schema (has `sections[]` or `title`). Falls
 * back to the original payload so the caller can still inspect it.
 */
export function normalizeAgentPayload(p) {
  if (p === null || p === undefined) return {};
  if (typeof p === 'string') {
    try { return normalizeAgentPayload(JSON.parse(p)); } catch { return {}; }
  }
  if (typeof p !== 'object' || Array.isArray(p)) return {};

  // Direct hit: shaped like our schema already
  if (looksLikeReport(p)) return p;

  // BFS through nested object values to find the first node that does
  const queue = Object.values(p);
  while (queue.length) {
    const item = queue.shift();
    if (item === null || item === undefined) continue;
    if (typeof item === 'string') {
      // Sometimes the agent stringifies the result one level deep
      try {
        const parsed = JSON.parse(item);
        if (parsed && typeof parsed === 'object') {
          if (looksLikeReport(parsed)) return parsed;
          if (Array.isArray(parsed)) queue.push(...parsed);
          else queue.push(...Object.values(parsed));
        }
      } catch { /* not JSON, skip */ }
      continue;
    }
    if (typeof item !== 'object') continue;
    if (Array.isArray(item)) { queue.push(...item); continue; }
    if (looksLikeReport(item)) return item;
    queue.push(...Object.values(item));
  }
  return p;   // fallback — caller will see empty/odd shape and we surface raw in UI
}

function looksLikeReport(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (Array.isArray(o.sections) && o.sections.length > 0) return true;
  if (typeof o.title === 'string' && o.title.trim().length > 3 && (Array.isArray(o.sources) || Array.isArray(o.sections))) return true;
  return false;
}

/** Fallback: pull [N] tokens out of body markdown when the agent omits source_indexes. */
function extractInlineCiteIndexes(body) {
  if (!body) return [];
  const out = new Set();
  const re = /\[(\d{1,3})\]/g;
  let m;
  while ((m = re.exec(body)) !== null) out.add(Number(m[1]));
  return [...out];
}
