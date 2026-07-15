// =============================================================================
// Local Engine 6 — Tech-Stack Fingerprinter (Stage 12) — Phase 2 / B1.
// -----------------------------------------------------------------------------
// Detects what a company's website RUNS — CMS, e-commerce, analytics, chat,
// payments, frameworks — by matching high-precision markers against the
// homepage HTML we fetch locally (fetchPage → Crawl4AI/Playwright render
// fallback, same ladder as Engine 5). 100% local, $0, no external API.
//
// Doctrine: PRECISION over recall (the 100% bar) — every fingerprint is an
// unambiguous marker (asset host, path signature, generator tag). Nothing is
// inferred. A datum lands in `company_tech` only with the exact evidence
// snippet that proved it, so the Sources tab can show WHY Bell believes it.
//
// Why it matters: technographics = one of the giants' (ZoomInfo/Datanyze)
// core data layers. For Bell: new Companies filters ("runs Shopify"),
// Bella awareness, and future change-signals ("just adopted X").
//
// FINGERPRINTS + detectTech() are PURE and exported for unit tests.
// =============================================================================

import { query } from '../../db.js';
import { fetchPage } from './http.js';
import { rendererAvailable, renderPage } from './render.js';
import { recordSearch } from './ledger.js';

const TS = { scanned: 0, detected: 0, companies_with_tech: 0, errors: 0 };
export function techState() { return { ...TS }; }

// ── Fingerprint table (pure) ─────────────────────────────────────────────────
// rx runs against the raw HTML (case-insensitive). Keep every entry
// high-precision; grow from evidence (Sources tab / rejects), never guesses.
export const FINGERPRINTS = [
  // CMS / site builders
  { tech: 'WordPress',     category: 'cms',        rx: /wp-content\/|wp-includes\/|content=["']WordPress/i },
  { tech: 'Elementor',     category: 'cms',        rx: /wp-content\/plugins\/elementor/i },
  { tech: 'Shopify',       category: 'ecommerce',  rx: /cdn\.shopify\.com|myshopify\.com|Shopify\.theme/i },
  { tech: 'WooCommerce',   category: 'ecommerce',  rx: /wp-content\/plugins\/woocommerce|woocommerce-page/i },
  { tech: 'Wix',           category: 'cms',        rx: /static\.wixstatic\.com|static\.parastorage\.com/i },
  { tech: 'Squarespace',   category: 'cms',        rx: /static1\.squarespace\.com|content=["']Squarespace/i },
  { tech: 'Webflow',       category: 'cms',        rx: /assets\.website-files\.com|data-wf-page=/i },
  { tech: 'Drupal',        category: 'cms',        rx: /content=["']Drupal|\/sites\/default\/files\//i },
  { tech: 'Joomla',        category: 'cms',        rx: /content=["']Joomla|\/media\/jui\//i },
  { tech: 'Magento',       category: 'ecommerce',  rx: /\/static\/version\d+\/frontend\/|Magento_/i },
  { tech: 'PrestaShop',    category: 'ecommerce',  rx: /content=["']PrestaShop|prestashop\.js/i },
  // Frameworks
  { tech: 'Next.js',       category: 'framework',  rx: /__NEXT_DATA__|\/_next\/static\//i },
  { tech: 'Nuxt',          category: 'framework',  rx: /__NUXT__|\/_nuxt\//i },
  { tech: 'React',         category: 'framework',  rx: /data-reactroot|react-dom(?:\.production)?(?:\.min)?\.js/i },
  { tech: 'Angular',       category: 'framework',  rx: /\bng-version=/i },
  { tech: 'Vue.js',        category: 'framework',  rx: /\bdata-v-[0-9a-f]{8}\b|\bvue(?:\.min)?\.js/i },
  { tech: 'jQuery',        category: 'framework',  rx: /jquery(?:[.-][\d.]+)?(?:\.min|\.slim(?:\.min)?)?\.js/i },
  { tech: 'Bootstrap',     category: 'framework',  rx: /bootstrap(?:[.-][\d.]+)?(?:\.min)?\.(?:css|js)/i, confidence: 'medium' },
  // Analytics & marketing
  { tech: 'Google Analytics',   category: 'analytics', rx: /googletagmanager\.com\/gtag\/js|google-analytics\.com\/(?:analytics|ga)\.js/i },
  { tech: 'Google Tag Manager', category: 'analytics', rx: /googletagmanager\.com\/gtm\.js/i },
  { tech: 'Meta Pixel',         category: 'marketing', rx: /connect\.facebook\.net\/[^"']{0,40}fbevents\.js/i },
  { tech: 'Hotjar',             category: 'analytics', rx: /static\.hotjar\.com/i },
  { tech: 'LinkedIn Insight',   category: 'marketing', rx: /snap\.licdn\.com/i },
  { tech: 'TikTok Pixel',       category: 'marketing', rx: /analytics\.tiktok\.com/i },
  { tech: 'Snap Pixel',         category: 'marketing', rx: /sc-static\.net\/scevent/i },
  // Chat / support — WhatsApp especially matters in Qatar
  { tech: 'WhatsApp chat',  category: 'chat', rx: /(?:api\.whatsapp\.com\/send|wa\.me\/\d)/i, confidence: 'medium' },
  { tech: 'Intercom',       category: 'chat', rx: /widget\.intercom\.io|js\.intercomcdn\.com/i },
  { tech: 'Tawk.to',        category: 'chat', rx: /embed\.tawk\.to/i },
  { tech: 'Zendesk',        category: 'chat', rx: /static\.zdassets\.com/i },
  { tech: 'Crisp',          category: 'chat', rx: /client\.crisp\.chat/i },
  { tech: 'HubSpot',        category: 'marketing', rx: /js\.hs-scripts\.com|js\.hsforms\.net/i },
  { tech: 'Drift',          category: 'chat', rx: /js\.driftt\.com/i },
  // Payments — incl. the Gulf gateways
  { tech: 'Stripe',        category: 'payments', rx: /js\.stripe\.com/i },
  { tech: 'PayPal',        category: 'payments', rx: /paypal\.com\/sdk\/js|paypalobjects\.com/i },
  { tech: 'Tap Payments',  category: 'payments', rx: /(?:checkout|secure)\.tap\.company|gosell/i },
  { tech: 'MyFatoorah',    category: 'payments', rx: /myfatoorah\.com/i },
  { tech: 'Checkout.com',  category: 'payments', rx: /cdn\.checkout\.com/i },
  // Infrastructure / integrations
  { tech: 'Cloudflare',    category: 'infrastructure', rx: /\/cdn-cgi\//i },
  { tech: 'reCAPTCHA',     category: 'integration',    rx: /www\.google\.com\/recaptcha/i },
  { tech: 'Google Maps embed', category: 'integration', rx: /maps\.googleapis\.com|google\.com\/maps\/embed/i },
];

// Pure: page {html, text} → [{tech, category, confidence, evidence}]
export function detectTech(page = {}) {
  const html = String(page.html || '');
  const hay = html.length >= 200 ? html : html + '\n' + String(page.text || '');
  if (!hay.trim()) return [];
  const out = [];
  for (const f of FINGERPRINTS) {
    const m = hay.match(f.rx);
    if (!m) continue;
    const at = Math.max(0, m.index - 30);
    out.push({
      tech: f.tech,
      category: f.category,
      confidence: f.confidence || 'high',
      evidence: hay.slice(at, at + 120).replace(/\s+/g, ' ').trim().slice(0, 160),
    });
  }
  return out;
}

// ── Engine plumbing (mirrors Engine 5) ───────────────────────────────────────
function toUrl(website) {
  if (!website) return '';
  let s = String(website).trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

async function markStage12(id, status, extras = {}) {
  await query(`UPDATE companies SET stage12_status=$2, stage12_at=now(), extra_fields=extra_fields||$3::jsonb WHERE id=$1`,
    [id, status, JSON.stringify(extras)]);
  await recordSearch(id, 12, status, extras);
}

async function getPage(url) {
  let p = await fetchPage(url, { respectRobots: false, timeoutMs: 9000, retries: 1 }).catch(() => null);
  if ((!p || !p.ok || (p.html || '').length < 600) && await rendererAvailable()) {
    const r = await renderPage(url).catch(() => null);
    if (r && r.ok) p = r;
  }
  return p && p.ok ? p : null;
}

export const TECH_UPSERT_SQL = `
  INSERT INTO company_tech (company_id, tech, category, evidence, confidence, source, updated_at)
  VALUES ($1, $2, $3, $4, $5, 'homepage', now())
  ON CONFLICT (company_id, tech) DO UPDATE
     SET category = EXCLUDED.category,
         evidence = EXCLUDED.evidence,
         confidence = EXCLUDED.confidence,
         updated_at = now()`;

export async function enrichCompany(company) {
  const url = toUrl(company.website);
  if (!url) { await markStage12(company.id, 'no_data', { stage12_skip: 'no-website' }); return { status: 'no_data', tech: 0 }; }

  // Content-identity guard: if the website was flagged as a DIFFERENT brand's content
  // (by the harvester or the cleanup .command), do NOT fingerprint it — the detected
  // tech would belong to the wrong company (e.g. the "Smart Evolution" WordPress site
  // sitting on foundationendowment.com). Rule 2.1: better no tech than wrong tech.
  const flagged = company.extra_fields?.website_content_conflict
    || (await query(`SELECT 1 FROM companies WHERE id=$1 AND extra_fields ? 'website_content_conflict'`, [company.id])).rows.length;
  if (flagged) { await markStage12(company.id, 'no_data', { stage12_skip: 'website_content_conflict' }); return { status: 'no_data', tech: 0 }; }

  TS.scanned++;
  const page = await getPage(url);
  if (!page) { await markStage12(company.id, 'no_data', { stage12_skip: 'unreachable' }); return { status: 'no_data', tech: 0 }; }

  const found = detectTech(page);
  for (const f of found) {
    await query(TECH_UPSERT_SQL, [company.id, f.tech, f.category, f.evidence, f.confidence]);
  }
  TS.detected += found.length;
  if (found.length) TS.companies_with_tech++;

  // A JS-shell page that never got rendered can still yield markers (analytics
  // tags live in the shell HTML), but an EMPTY result from it proves nothing —
  // flag it so the ledger records degraded_empty, not proof of absence.
  const shell = (page.html || '').length < 600 && !page.rendered;
  await markStage12(company.id, found.length ? 'done' : 'no_data',
    { stage12_tech: found.length, stage12_source: page.finalUrl || url, ...(shell && !found.length ? { stage12_shell_unrendered: true } : {}) });
  return { status: found.length ? 'done' : 'no_data', tech: found.length };
}

export async function enrichCompanies(companies, jobLog = null) {
  let done = 0, no_data = 0, failed = 0, tech = 0;
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    try {
      const r = await enrichCompany(c);
      if (r.status === 'done') done++; else if (r.status === 'failed') failed++; else no_data++;
      tech += r.tech || 0;
      jobLog?.(`  ${r.status === 'done' ? '✓' : '·'} [${i + 1}/${companies.length}] ${c.name} — ${r.tech || 0} tech marker(s)`);
    } catch (err) {
      failed++; TS.errors++;
      try { await markStage12(c.id, 'failed', { stage12_error: String(err.message || err).slice(0, 140) }); } catch { /* ignore */ }
      jobLog?.(`  ✗ [${i + 1}/${companies.length}] ${c.name} — ${err.message}`);
    }
  }
  return { done, no_data, failed, usd: 0, tech };
}
