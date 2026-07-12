-- Phase 6 · Bell as a business — self-economics (Val 2026-07-12).
-- The fixed monthly service costs of running Bell (Railway, Anthropic, Firecrawl,
-- …) that Bell can't auto-meter — recorded by the operator so the Economics
-- dashboard can compute true burn + margin against revenue (tenant plans) and the
-- API spend Bell DOES track (research USD, credits). Admin-only; mirrored by id.

CREATE TABLE IF NOT EXISTS operating_costs (
  id             bigserial PRIMARY KEY,
  service        text NOT NULL,
  category       text,               -- compute | ai | enrichment | auth | payments | email | maps | voice | other
  monthly_amount numeric NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'USD',
  note           text,
  active         boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed the known services at 0 (the operator fills in the real monthly figure).
INSERT INTO operating_costs (service, category, monthly_amount, currency, note)
SELECT * FROM (VALUES
  ('Railway (compute + Postgres)', 'compute',    0, 'USD', 'Hosting for the 3 deployments + database'),
  ('Anthropic API (Bella + summaries)', 'ai',    0, 'USD', 'Claude usage for Bella, news + marketing'),
  ('Firecrawl (research + websites)', 'enrichment', 0, 'USD', 'Paid crawl credits'),
  ('Apify (map + directory scrapers)', 'enrichment', 0, 'USD', 'Paid actor runs'),
  ('Clerk (auth)',            'auth',      0, 'USD', 'Authentication'),
  ('Stripe (payments)',       'payments',  0, 'USD', 'Payment processing fees'),
  ('Resend (email)',          'email',     0, 'USD', 'Transactional + outreach email'),
  ('Mapbox (map tiles)',      'maps',      0, 'USD', 'Map tile + geocoding quota'),
  ('ElevenLabs (voice)',      'voice',     0, 'USD', 'Bella voice TTS'),
  ('Cloudflare',              'compute',   0, 'USD', 'CDN / DNS')
) AS v(service, category, monthly_amount, currency, note)
WHERE NOT EXISTS (SELECT 1 FROM operating_costs);
