// address_rules.js — classify a company email address for OUTREACH safety. Pure +
// deterministic (Rule 2.1 — never guess). Given an email, and whether Bell links it to a
// NAMED person, decide which tier it belongs to:
//
//   role_mailbox  — a generic company inbox (info@, tenders@, sales@): you are addressing
//                   the COMPANY as an entity, not a natural person. This is the tier Bell
//                   can most defensibly email (the strongest argument for being outside
//                   PDPPL Art 22 — pending the lawyer's written confirmation).
//   named_person  — identifies a natural person (ahmed.hassan@, or an address Bell links to
//                   a person record). PDPPL Art 22 clearly applies → HIGHEST RISK tier.
//   unclassified  — we cannot tell. NOT assumed safe. Absence of evidence that it is a role
//                   mailbox is not evidence that it is one (silence ≠ permission).
//
// This does NOT decide legality — it sorts the list so Val (and the engine) can target the
// defensible tier first and see exactly how much of the database is what.

// Generic, non-personal company mailboxes. Compact (separators stripped) form is matched too
// so "contact-us"/"contact_us"/"contactus" all count.
export const ROLE_LOCALPARTS = new Set([
  'info', 'information', 'contact', 'contactus', 'contacts', 'enquiry', 'enquiries',
  'inquiry', 'inquiries', 'hello', 'hi', 'hey', 'mail', 'email', 'office', 'reception',
  'frontdesk', 'general', 'admin', 'administration', 'administrator', 'webmaster', 'postmaster',
  'sales', 'sale', 'presales', 'business', 'biz', 'bd', 'businessdevelopment', 'partnerships', 'partner',
  'support', 'help', 'helpdesk', 'service', 'services', 'customerservice', 'customercare', 'care',
  'tender', 'tenders', 'tendering', 'procurement', 'purchase', 'purchasing', 'purchases', 'buyer', 'buying', 'supply', 'supplychain',
  'hr', 'humanresources', 'recruitment', 'recruit', 'careers', 'career', 'jobs', 'job', 'hiring',
  'accounts', 'account', 'accounting', 'accountant', 'finance', 'financial', 'billing', 'invoice', 'invoices', 'payments', 'payment', 'ar', 'ap',
  'marketing', 'market', 'pr', 'media', 'press', 'comms', 'communications', 'social', 'digital',
  'orders', 'order', 'booking', 'bookings', 'reservation', 'reservations', 'reserve',
  'team', 'company', 'corporate', 'group', 'operations', 'ops', 'projects', 'project', 'quality', 'qa', 'quote', 'quotes', 'rfq',
  'it', 'tech', 'technical', 'systems', 'shop', 'store', 'online', 'web', 'website', 'noreply', 'no-reply', 'donotreply',
]);

// firstname.lastname / f.lastname / firstname_lastname — two alpha tokens joined by a dot or
// underscore, or an initial + surname. A strong signal of a personal mailbox.
const PERSON_SEP_RX = /^[a-z]{1,}[._][a-z]{2,}$/i;         // ahmed.hassan / a.hassan / ahmed_hassan
const INITIALS_RX = /^[a-z]\.[a-z]{2,}$/i;                 // a.hassan (covered above too)

// email: the address. hasLinkedPerson: does Bell hold a NAMED person record for this email?
export function classifyAddress({ email, hasLinkedPerson = false } = {}) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.indexOf('@');
  if (at < 1 || at === e.length - 1) return { outcome: 'unclassified', basis: 'invalid_email', evidence: { email: e } };
  const local = e.slice(0, at);
  const compact = local.replace(/[._+-]/g, '');

  // 1. Bell links this address to a NAMED person → it identifies a natural person. Strongest,
  //    most conservative signal; wins over a role-word coincidence.
  if (hasLinkedPerson) return { outcome: 'named_person', basis: 'linked_person_record', evidence: { email: e } };

  // 2. A generic role mailbox by its local-part.
  if (ROLE_LOCALPARTS.has(local) || ROLE_LOCALPARTS.has(compact)) {
    return { outcome: 'role_mailbox', basis: 'localpart_in_role_list', evidence: { localpart: local } };
  }

  // 3. A first.last / f.last personal pattern.
  if (PERSON_SEP_RX.test(local) || INITIALS_RX.test(local)) {
    return { outcome: 'named_person', basis: 'firstname_lastname_pattern', evidence: { localpart: local } };
  }

  // 4. Can't tell — a bare word like "ahmed" or "alwaab" could be either. Not assumed safe.
  return { outcome: 'unclassified', basis: 'no_rule_matched', evidence: { localpart: local } };
}
