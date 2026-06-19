// Tiny fetch wrapper around the Portal's local JSON API.
//
// When the Portal is deployed in user/admin mode (with Clerk auth), every
// request automatically picks up the current Clerk session token and sends
// it as Authorization: Bearer ... — this is bridged via window.__bdiAuth.
// In local-admin mode there's no token; the server doesn't require one.

const BASE = '';

async function authHeaders() {
  const auth = (typeof window !== 'undefined') ? window.__bdiAuth : null;
  if (!auth?.getToken) return {};
  try {
    const token = await auth.getToken();
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  } catch { return {}; }
}

async function request(path, options = {}) {
  const auth = await authHeaders();
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...auth, ...(options.headers || {}) },
    ...options,
  });
  // 401 in user/admin mode. Do NOT auto-redirect to /sign-in — that creates
  // a redirect loop with the sign-in page (which redirects back to / when
  // Clerk session exists). Instead surface the error to the caller, which
  // can decide what to do based on context.
  if (r.status === 401 && typeof window !== 'undefined' && window.__bdiAuth?.required) {
    let body = null;
    try { body = await r.json(); } catch {}
    console.error('[bdi/api] 401 for', path, body);
    const err = new Error('Unauthorized: ' + (body?.reason || body?.error || 'no_reason'));
    err.status = 401;
    err.body = body;
    throw err;
  }
  const ct = r.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await r.json() : await r.text();
  if (!r.ok) {
    const msg = body?.message || body?.error || ('HTTP ' + r.status);
    throw new Error(msg);
  }
  return body;
}

export const api = {
  health:                 () => request('/api/health'),
  stats:                  () => request('/api/stats'),
  stageProgress:          () => request('/api/stats/stage-progress'),

  companies:              (q = {}) => request('/api/companies?' + new URLSearchParams(q)),
  companyIndustries:      () => request('/api/companies/industries'),
  companiesMap:           () => request('/api/companies/map'),
  publicToken:            (name) => request('/api/settings/public-token/' + name),
  company:                (id) => request('/api/companies/' + id),
  updateCompany:          (id, body) => request('/api/companies/' + id, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveCompany:         (id, archived) => request(`/api/companies/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }),
  deleteCompany:          (id) => request('/api/companies/' + id, { method: 'DELETE' }),
  keepCompany:            (id) => request(`/api/companies/${id}/keep`, { method: 'POST', body: '{}' }),
  // Research approval queue (local engine only)
  researchCandidates:     (params = {}) => request('/api/research-candidates?' + new URLSearchParams(params)),
  approveCandidate:       (id) => request(`/api/research-candidates/${id}/approve`, { method: 'POST', body: '{}' }),
  rejectCandidate:        (id) => request(`/api/research-candidates/${id}/reject`, { method: 'POST', body: '{}' }),
  restoreCandidate:       (id) => request(`/api/research-candidates/${id}/restore`, { method: 'POST', body: '{}' }),
  resetEnrichment:        (id) => request(`/api/companies/${id}/reset-enrichment`, { method: 'POST', body: '{}' }),
  revealCompany:          (id) => request(`/api/companies/${id}/reveal`, { method: 'POST', body: '{}' }),
  revealCompaniesBulk:    (ids) => request('/api/companies/reveal-bulk', { method: 'POST', body: JSON.stringify({ ids }) }),

  jobRuns:                (params = {}) => request('/api/job-runs?' + new URLSearchParams(params)),
  jobRun:                 (id, since = 0) => request(`/api/job-runs/${id}?since=${since}`),
  setLinkedInUrl:         (id, url) => request(`/api/companies/${id}/set-linkedin-url`, { method: 'POST', body: JSON.stringify({ url }) }),
  reclassifyStatuses:     () => request('/api/companies/reclassify-statuses', { method: 'POST', body: '{}' }),
  addCompanyContact:      (id, body) => request(`/api/companies/${id}/contacts`, { method: 'POST', body: JSON.stringify(body) }),
  setCompanyContactPrimary: (id, cid, type) => request(`/api/companies/${id}/contacts/${cid}/primary`, { method: 'POST', body: JSON.stringify({ type }) }),
  deleteCompanyContact:   (id, cid) => request(`/api/companies/${id}/contacts/${cid}`, { method: 'DELETE' }),

  people:                 (q = {}) => request('/api/people?' + new URLSearchParams(q)),
  person:                 (id) => request('/api/people/' + id),
  updatePerson:           (id, body) => request('/api/people/' + id, { method: 'PATCH', body: JSON.stringify(body) }),
  archivePerson:          (id, archived) => request(`/api/people/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }),
  revealPerson:           (id) => request(`/api/people/${id}/reveal`, { method: 'POST', body: '{}' }),
  // Detail requests
  requestDetails:         (companyId, note) => request('/api/detail-requests', { method: 'POST', body: JSON.stringify({ company_id: companyId, note }) }),
  myDetailRequest:        (companyId) => request('/api/detail-requests/mine?company_id=' + companyId),
  detailRequests:         (status = 'pending') => request('/api/detail-requests?status=' + status),
  detailRequestsCount:    () => request('/api/detail-requests/count'),
  decideDetailRequest:    (id, action, adminNote) => request(`/api/detail-requests/${id}/decide`, { method: 'POST', body: JSON.stringify({ action, admin_note: adminNote }) }),
  revealPeopleBulk:       (ids) => request('/api/people/reveal-bulk', { method: 'POST', body: JSON.stringify({ ids }) }),
  deepEnrichPeople:       (personIds) => request('/api/people/deep-enrich', { method: 'POST', body: JSON.stringify({ person_ids: personIds }) }),
  recomputeSeniority:     () => request('/api/people/recompute-seniority', { method: 'POST', body: '{}' }),
  addPersonContact:       (id, body) => request(`/api/people/${id}/contacts`, { method: 'POST', body: JSON.stringify(body) }),
  setPersonContactPrimary: (id, cid, type) => request(`/api/people/${id}/contacts/${cid}/primary`, { method: 'POST', body: JSON.stringify({ type }) }),
  deletePersonContact:    (id, cid) => request(`/api/people/${id}/contacts/${cid}`, { method: 'DELETE' }),

  jobs:                   (q = {}) => request('/api/jobs?' + new URLSearchParams(q)),
  job:                    (id) => request('/api/jobs/' + id),
  updateJob:              (id, body) => request('/api/jobs/' + id, { method: 'PATCH', body: JSON.stringify(body) }),

  settings:               () => request('/api/settings'),
  updateSettings:         (body) => request('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  setApiKey:              (name, value) => request('/api/settings/api-keys/' + name, { method: 'POST', body: JSON.stringify({ value }) }),
  deleteApiKey:           (name) => request('/api/settings/api-keys/' + name, { method: 'DELETE' }),

  sources:                () => request('/api/sources'),
  startIngest:            (source) => request(`/api/sources/${source}/ingest`, { method: 'POST', body: '{}' }),
  startScrape:            (source) => request(`/api/sources/${source}/scrape`, { method: 'POST', body: '{}' }),
  sourceJob:              (id, since = 0) => request(`/api/sources/jobs/${id}?since=${since}`),

  enrichmentStages:       () => request('/api/enrichment/stages'),
  enrichmentRuns:         (limit = 25) => request('/api/enrichment/runs?limit=' + limit),
  runEnrichment:          (body) => request('/api/enrichment/run', { method: 'POST', body: JSON.stringify(body) }),
  runHarvestSweep:        (limit = 100) => request('/api/enrichment/sweep', { method: 'POST', body: JSON.stringify({ limit }) }),
  finderAudit:            () => request('/api/enrichment/finder-audit'),
  finderCleanup:          (buckets) => request('/api/enrichment/finder-cleanup', { method: 'POST', body: JSON.stringify({ buckets }) }),
  websiteCandidates:      (status = 'pending') => request('/api/enrichment/website-candidates?status=' + status),
  websiteCandidatesCount: () => request('/api/enrichment/website-candidates/count'),
  decideWebsiteCandidate: (id, action) => request(`/api/enrichment/website-candidates/${id}/decide`, { method: 'POST', body: JSON.stringify({ action }) }),
  relationships:          (companyId) => request('/api/enrichment/relationships/' + companyId),
  enrichmentJob:          (id, since = 0) => request(`/api/enrichment/jobs/${id}?since=${since}`),
  harvestHistory:         (limit = 50) => request('/api/enrichment/harvest-history?limit=' + limit),
  // Manual Company Lookup — type a name, local engines find everything, approve/reject.
  manualLookups:          (status = 'all') => request('/api/enrichment/manual-lookups?status=' + status),
  startManualLookup:      (name) => request('/api/enrichment/manual-lookup', { method: 'POST', body: JSON.stringify({ name }) }),
  decideManualLookup:     (id, action) => request(`/api/enrichment/manual-lookups/${id}/decide`, { method: 'POST', body: JSON.stringify({ action }) }),

  // Notifications
  notifications:            (params = {}) => request('/api/notifications?' + new URLSearchParams(params)),
  notificationsUnread:      () => request('/api/notifications/unread-count'),
  markNotificationRead:     (id) => request(`/api/notifications/${id}/read`, { method: 'POST', body: '{}' }),
  markAllNotificationsRead: () => request('/api/notifications/read-all', { method: 'POST', body: '{}' }),
  sendAnnouncement:         (body) => request('/api/notifications/announce', { method: 'POST', body: JSON.stringify(body) }),
  listAnnouncements:        () => request('/api/notifications/announcements'),
  recallAnnouncement:       (id) => request(`/api/notifications/announcements/${id}/recall`, { method: 'POST', body: '{}' }),
  // Email templates (admin-editable)
  emailTemplates:           () => request('/api/email-templates'),
  emailTemplate:            (key) => request('/api/email-templates/' + key),
  saveEmailTemplate:        (key, body) => request('/api/email-templates/' + key, { method: 'PUT', body: JSON.stringify(body) }),
  resetEmailTemplate:       (key) => request(`/api/email-templates/${key}/reset`, { method: 'POST', body: '{}' }),
  previewEmailTemplate:     (body) => request('/api/email-templates/preview', { method: 'POST', body: JSON.stringify(body) }),
  testEmailTemplate:        (key, body) => request(`/api/email-templates/${key}/test`, { method: 'POST', body: JSON.stringify(body) }),

  // Assembly (Phase 5)
  assemblyStats:          () => request('/api/assembly/stats'),
  assemblyAudit:          () => request('/api/assembly/audit'),
  assemblyRun:            () => request('/api/assembly/run', { method: 'POST', body: '{}' }),
  assemblyAssignIds:      () => request('/api/assembly/assign-ids', { method: 'POST', body: '{}' }),
  dedupQueue:             (limit = 50) => request('/api/assembly/dedup-queue?limit=' + limit),
  dedupBulkApprove:       () => request('/api/assembly/dedup/bulk-approve', { method: 'POST', body: '{}' }),
  dedupDecide:            (id, action, adminEmail) => request(`/api/assembly/dedup/${id}/decide`, { method: 'POST', body: JSON.stringify({ action, admin_email: adminEmail }) }),
  peopleDedupQueue:       (limit = 100) => request('/api/assembly/people/dedup-queue?limit=' + limit),
  peopleDedupDecide:      (id, action, adminEmail) => request(`/api/assembly/people/dedup/${id}/decide`, { method: 'POST', body: JSON.stringify({ action, admin_email: adminEmail }) }),

  similarCompanies:       (q = {}) => request('/api/similar-companies?' + new URLSearchParams(q)),
  similarBySource:        (companyId) => request('/api/similar-companies/by-source/' + companyId),
  decideSimilar:          (id, decision) => request('/api/similar-companies/' + id, { method: 'POST', body: JSON.stringify({ decision }) }),

  // Research (Phase R1 surface)
  researchTypes:          () => request('/api/research/types'),
  researchStats:          () => request('/api/research/stats'),
  researchJobs:           (q = {}) => request('/api/research/jobs?' + new URLSearchParams(q)),
  researchJob:            (id) => request('/api/research/jobs/' + id),
  createResearchJob:      (body) => request('/api/research/jobs', { method: 'POST', body: JSON.stringify(body) }),
  cancelResearchJob:      (id) => request(`/api/research/jobs/${id}/cancel`, { method: 'POST', body: '{}' }),
  deleteResearchJob:      (id) => request(`/api/research/jobs/${id}`, { method: 'DELETE' }),
  runResearchJob:         (id) => request(`/api/research/jobs/${id}/run`, { method: 'POST', body: '{}' }),
  releaseResearch:        (id) => request(`/api/research/jobs/${id}/release`, { method: 'POST', body: '{}' }),
  setResearchFeedOptout:  (id, optout) => request(`/api/research/jobs/${id}/feed-optout`, { method: 'POST', body: JSON.stringify({ optout }) }),
  pollResearchJob:        (id) => request(`/api/research/jobs/${id}/poll`, { method: 'POST', body: '{}' }),

  // CRM (per-tenant action layer)
  crmStats:               () => request('/api/crm/stats'),
  crmRecords:             (q = {}) => request('/api/crm/records?' + new URLSearchParams(q)),
  crmRecord:              (id) => request('/api/crm/records/' + id),
  crmAddRecord:           (entity_type, entity_id) => request('/api/crm/records', { method: 'POST', body: JSON.stringify({ entity_type, entity_id }) }),
  crmUpdateRecord:        (id, body) => request('/api/crm/records/' + id, { method: 'PATCH', body: JSON.stringify(body) }),
  crmAddNote:             (id, body) => request(`/api/crm/records/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  crmUpdateNote:          (id, body) => request('/api/crm/notes/' + id, { method: 'PATCH', body: JSON.stringify({ body }) }),
  crmDeleteNote:          (id) => request('/api/crm/notes/' + id, { method: 'DELETE' }),
  crmAddTask:             (id, body) => request(`/api/crm/records/${id}/tasks`, { method: 'POST', body: JSON.stringify(body) }),
  crmTasks:               (q = {}) => request('/api/crm/tasks?' + new URLSearchParams(q)),
  crmUpdateTask:          (id, body) => request('/api/crm/tasks/' + id, { method: 'PATCH', body: JSON.stringify(body) }),
  crmDeleteTask:          (id) => request('/api/crm/tasks/' + id, { method: 'DELETE' }),
  crmSendEmail:           (id, body) => request(`/api/crm/records/${id}/email`, { method: 'POST', body: JSON.stringify(body) }),
  crmTemplates:           () => request('/api/crm/templates'),
  crmSaveTemplate:        (body) => request('/api/crm/templates', { method: 'POST', body: JSON.stringify(body) }),
  crmSequences:           () => request('/api/crm/sequences'),
  crmSequence:            (id) => request('/api/crm/sequences/' + id),
  crmCreateSequence:      (body) => request('/api/crm/sequences', { method: 'POST', body: JSON.stringify(body) }),
  crmEnroll:              (recordId, sequence_id) => request(`/api/crm/records/${recordId}/enroll`, { method: 'POST', body: JSON.stringify({ sequence_id }) }),
  crmStopEnrollment:      (id) => request(`/api/crm/enrollments/${id}/stop`, { method: 'POST', body: '{}' }),
  crmBulk:                (ids, action, extra = {}) => request('/api/crm/records/bulk', { method: 'POST', body: JSON.stringify({ ids, action, ...extra }) }),
  crmSegments:            () => request('/api/crm/segments'),
  crmSaveSegment:         (name, filters) => request('/api/crm/segments', { method: 'POST', body: JSON.stringify({ name, filters }) }),
  crmDeleteSegment:       (id) => request('/api/crm/segments/' + id, { method: 'DELETE' }),
  crmPipeline:            () => request('/api/crm/pipeline'),
  crmCreateDeal:          (body) => request('/api/crm/deals', { method: 'POST', body: JSON.stringify(body) }),
  crmUpdateDeal:          (id, body) => request('/api/crm/deals/' + id, { method: 'PATCH', body: JSON.stringify(body) }),
  crmDeleteDeal:          (id) => request('/api/crm/deals/' + id, { method: 'DELETE' }),

  // Deep Data (Qatar Open Data)
  openDataStats:          () => request('/api/open-data/stats'),
  openDataDatasets:       (q = {}) => request('/api/open-data/datasets?' + new URLSearchParams(q)),
  openDataDataset:        (id) => request('/api/open-data/datasets/' + encodeURIComponent(id)),
  openDataChart:          (id) => request('/api/open-data/datasets/' + encodeURIComponent(id) + '/chart'),
  openDataRecords:        (id, q = {}) => request('/api/open-data/datasets/' + encodeURIComponent(id) + '/records?' + new URLSearchParams(q)),

  // Auth (Clerk-backed)
  authMode:               () => request('/api/auth/mode'),
  authMe:                 () => request('/api/auth/me'),
  openDataPreview:        (id, q = {}) => request('/api/open-data/datasets/' + encodeURIComponent(id) + '/preview?' + new URLSearchParams(q)),
  openDataRuns:           (limit = 25) => request('/api/open-data/runs?limit=' + limit),
  openDataSyncCatalog:    () => request('/api/open-data/sync/catalog', { method: 'POST', body: '{}' }),
  openDataSyncRecords:    () => request('/api/open-data/sync/records', { method: 'POST', body: '{}' }),
  openDataSyncOne:        (id) => request('/api/open-data/sync/records/' + encodeURIComponent(id), { method: 'POST', body: '{}' }),

  // Sync (local engine → Bell.qa)
  syncStatus:             () => request('/api/sync/status'),
  syncPush:               () => request('/api/sync/push', { method: 'POST', body: '{}' }),
  syncFullResync:         () => request('/api/sync/full-resync', { method: 'POST', body: '{}' }),
  syncRebuild:            () => request('/api/sync/rebuild', { method: 'POST', body: '{}' }),

  // Market Feed
  feed:                   (q = {}) => request('/api/feed?' + new URLSearchParams(q)),
  feedItem:               (id) => request('/api/feed/' + id),
  feedStats:              () => request('/api/feed/stats'),
  feedTrending:           () => request('/api/feed/trending'),

  // Credits
  creditBalance:          () => request('/api/credits'),
  creditLedger:           (limit = 50) => request('/api/credits/ledger?limit=' + limit),
  creditAdjust:           (tenant_id, delta, note) => request('/api/credits/adjust', { method: 'POST', body: JSON.stringify({ tenant_id, delta, note }) }),

  // Billing (Stripe-backed)
  billingPlans:           () => request('/api/billing/plans'),
  billingSubscription:    () => request('/api/billing/subscription'),
  billingCheckout:        (plan_id) => request('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan_id }) }),
  billingPortal:          () => request('/api/billing/portal', { method: 'POST', body: '{}' }),
  billingInvoices:        () => request('/api/billing/invoices'),
  billingUsage:           (limit = 50) => request('/api/billing/usage?limit=' + limit),

  // Account (the signed-in user's own profile / notifications / preferences)
  getAccount:             () => request('/api/account'),
  updateAccount:          (patch) => request('/api/account', { method: 'PATCH', body: JSON.stringify(patch) }),
};
