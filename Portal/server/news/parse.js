// Minimal, dependency-free RSS 2.0 + Atom feed parser.
//
// Handles the fields Market Feed needs: title, link, summary, published date,
// guid, image, author — across RSS <item> and Atom <entry>, with CDATA and
// HTML-entity decoding. Built to be tolerant: a malformed item is skipped, not
// fatal. (We avoid an XML lib so there's nothing to install at build time and
// the parser is unit-testable in isolation.)

import crypto from 'crypto';

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&#39;': "'", '&#34;': '"', '&nbsp;': ' ',
};

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&[a-zA-Z]+;|&#\d+;/g, (m) => ENTITIES[m] ?? m);
}
function safeFromCodePoint(n) {
  try { return String.fromCodePoint(n); } catch { return ''; }
}

function stripCdata(s) {
  if (!s) return s;
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}
function stripTags(s) {
  if (!s) return s;
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function clean(s, { keepLength = 600 } = {}) {
  if (s == null) return null;
  let out = decodeEntities(stripTags(stripCdata(String(s)))).trim();
  if (out.length > keepLength) out = out.slice(0, keepLength).trim() + '…';
  return out || null;
}

// Pull the inner text of the first <tag>…</tag> (any namespace prefix allowed).
function tag(block, name) {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}
// Pull an attribute from the first matching self-or-open tag.
function tagAttr(block, name, attr) {
  const re = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*\\b${attr}=["']([^"']+)["'][^>]*>`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

function toDate(s) {
  if (!s) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickLink(block) {
  // RSS: <link>url</link>. Atom: <link href="url" rel="alternate"/> (prefer alternate).
  const rss = tag(block, 'link');
  if (rss && /^https?:/i.test(rss.trim())) return rss.trim();
  // Atom alternate link first, else any link href.
  const alt = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
           || block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i)
           || block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  return alt ? alt[1] : null;
}

function pickImage(block) {
  return tagAttr(block, 'media:content', 'url')
      || tagAttr(block, 'media:thumbnail', 'url')
      || tagAttr(block, 'enclosure', 'url')
      || null;
}

function hash(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

/**
 * Parse a feed XML string into normalized items.
 * @returns {{title, link, summary, published_at, guid, image_url, author}[]}
 */
export function parseFeed(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi;
  const blocks = xml.match(blockRe) || [];

  const items = [];
  for (const block of blocks) {
    const title = clean(tag(block, 'title'), { keepLength: 400 });
    const link = pickLink(block);
    if (!title && !link) continue;

    const summary = clean(tag(block, 'description') || tag(block, 'summary') || tag(block, 'content'));
    const published_at = toDate(tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'date'));
    const author = clean(tag(block, 'creator') || tag(block, 'author'), { keepLength: 120 });
    const image_url = pickImage(block);

    // GUID: explicit <guid>/<id>, else the link, else a hash of title+link.
    let guid = (stripCdata(tag(block, 'guid') || tag(block, 'id') || '') || '').trim();
    if (!guid) guid = (link || '').trim();
    if (!guid) guid = hash((title || '') + '|' + (summary || ''));

    items.push({ title: title || '(untitled)', link, summary, published_at, guid, image_url, author });
  }
  return items;
}
