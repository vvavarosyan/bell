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

// Consumer / ISP mail domains. A role WORD on one of these is never that company's inbox:
// info@gmail.com cannot belong to a specific Qatar company — anybody can register it, and Bell
// holds it against 3 different companies at once. qatar.net.qa is Ooredoo's consumer mail
// domain and is the single largest uncorroborable domain in Bell's only market (859 companies).
// This VETOES the role_mailbox promotion below; it never asserts anything positive, and it
// leaves a bare-word address exactly where it was (unclassified).
export const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com',
  'msn.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'gmx.com',
  'gmx.net', 'mail.ru', 'yandex.com', 'zoho.com', 'qq.com', '163.com', '126.com',
  'rediffmail.com', 'sify.com', 'inbox.com', 'fastmail.com', 'windowslive.com', 'mail.com',
  'qatar.net.qa', 'qatarnet.qa',
]);

// email: the address. hasLinkedPerson: does Bell hold a NAMED person record for this email?
// verdict: a RECORDED decision for this address (address_verdicts), which outranks every rule
//   below — it is either Val's own call or an auto-rule that was adversarially verified.
export function classifyAddress({ email, hasLinkedPerson = false, verdict = null } = {}) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.indexOf('@');
  if (at < 1 || at === e.length - 1) return { outcome: 'unclassified', basis: 'invalid_email', evidence: { email: e } };
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const compact = local.replace(/[._+-]/g, '');

  // 0. A recorded verdict wins outright. 'not_a_company_address' is its own outcome so the
  //    targeting counters can report it honestly rather than hiding it inside 'unclassified'.
  if (verdict === 'role_mailbox' || verdict === 'named_person' || verdict === 'not_a_company_address') {
    return { outcome: verdict, basis: 'recorded_verdict', evidence: { email: e } };
  }

  // 1. Bell links this address to a NAMED person → it identifies a natural person. Strongest,
  //    most conservative signal; wins over a role-word coincidence.
  if (hasLinkedPerson) return { outcome: 'named_person', basis: 'linked_person_record', evidence: { email: e } };

  // 2. A generic role mailbox by its local-part — but never on a consumer/ISP domain.
  if (ROLE_LOCALPARTS.has(local) || ROLE_LOCALPARTS.has(compact)) {
    if (CONSUMER_DOMAINS.has(domain)) {
      return { outcome: 'unclassified', basis: 'role_word_on_consumer_domain', evidence: { localpart: local, domain } };
    }
    return { outcome: 'role_mailbox', basis: 'localpart_in_role_list', evidence: { localpart: local } };
  }

  // 3. A first.last / f.last personal pattern.
  if (PERSON_SEP_RX.test(local) || INITIALS_RX.test(local)) {
    return { outcome: 'named_person', basis: 'firstname_lastname_pattern', evidence: { localpart: local } };
  }

  // 4. Can't tell — a bare word like "ahmed" or "alwaab" could be either. Not assumed safe.
  return { outcome: 'unclassified', basis: 'no_rule_matched', evidence: { localpart: local } };
}
