-- Per-tenant outbound sending identity (Phase 1 outreach).
-- Every tenant gets an instant Bell-subdomain address (kind='bell') and may
-- connect their own custom domain (kind='custom'), verified via Resend.
CREATE TABLE IF NOT EXISTS tenant_email_domains (
  id               bigserial PRIMARY KEY,
  tenant_id        bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'custom' CHECK (kind IN ('bell','custom')),
  domain           text NOT NULL,
  from_email       text NOT NULL,
  from_name        text,
  signature_html   text,
  resend_domain_id text,
  dns_records      jsonb,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('active','pending','verified','failed')),
  is_default       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  verified_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tenant_email_domains_tenant ON tenant_email_domains(tenant_id);
-- at most one default sending identity per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_email_default ON tenant_email_domains(tenant_id) WHERE is_default;
-- a domain is unique within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_email_domain ON tenant_email_domains(tenant_id, domain);
