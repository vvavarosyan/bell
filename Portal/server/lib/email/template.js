// Branded, reusable HTML email base — used for BOTH notification emails and
// CRM outreach. Table-based layout with fully-inlined styles for broad email-
// client support (Gmail, Outlook, Apple Mail). Light, professional, robust:
// header (wordmark + accent bar), body card, optional CTA button, footer with
// signature, links, address and an unsubscribe line.
//
// Usage:
//   renderEmail({ heading, preheader, contentHtml, ctaText, ctaUrl })
//   renderAnnouncementEmail({ title, body, ctaText, ctaUrl })

const BRAND = {
  name:    'Bell',
  product: 'Bell — Qatar Business Intelligence',
  accent:  '#3B6CF6',
  ink:     '#0F172A',
  muted:   '#64748B',
  line:    '#E5E9F2',
  bg:      '#F4F6FB',
  card:    '#FFFFFF',
  appUrl:  process.env.BELL_APP_URL || 'https://app.bell.qa',
  site:    process.env.BELL_SITE_URL || 'https://bell.qa',
  address: process.env.BELL_ADDRESS || 'Bell · Doha, Qatar',
  signature: process.env.BELL_EMAIL_SIGNATURE || 'The Bell Team',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/** Convert a plain-text body to safe paragraph HTML (preserves line breaks). */
export function textToHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px;color:${BRAND.ink};font-size:15px;line-height:1.6;">${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function ctaButton(text, url) {
  if (!text || !url) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
      <tr><td style="border-radius:8px;background:${BRAND.accent};">
        <a href="${esc(url)}" target="_blank"
           style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          ${esc(text)}
        </a>
      </td></tr>
    </table>`;
}

/**
 * Render a complete branded HTML email.
 * @param {object} o
 * @param {string} o.heading      Big heading inside the card.
 * @param {string} [o.preheader]  Hidden inbox-preview text.
 * @param {string} [o.contentHtml] Body HTML (use textToHtml() for plain text).
 * @param {string} [o.ctaText]    Optional CTA button label.
 * @param {string} [o.ctaUrl]     Optional CTA button URL.
 * @param {string} [o.footerNote] Optional small note above the standard footer.
 * @param {string} [o.unsubscribeUrl] Optional unsubscribe link.
 */
export function renderEmail({ heading = '', preheader = '', contentHtml = '', ctaText = '', ctaUrl = '', footerNote = '', unsubscribeUrl = '' } = {}) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<title>${esc(heading || BRAND.name)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};">
    <tr><td align="center" style="padding:28px 14px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">

        <!-- Header -->
        <tr><td style="padding:4px 6px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${BRAND.ink};">
              <span style="color:${BRAND.accent};">●</span> ${BRAND.name}
            </td>
            <td align="right" style="font-size:12px;color:${BRAND.muted};">${esc(BRAND.product)}</td>
          </tr></table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">
          <div style="height:4px;background:${BRAND.accent};"></div>
          <div style="padding:28px 30px 26px;">
            ${heading ? `<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:${BRAND.ink};font-weight:700;">${esc(heading)}</h1>` : ''}
            ${contentHtml}
            ${ctaButton(ctaText, ctaUrl)}
            <p style="margin:22px 0 0;color:${BRAND.muted};font-size:14px;line-height:1.6;">
              Best regards,<br/><strong style="color:${BRAND.ink};">${esc(BRAND.signature)}</strong>
            </p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 8px 6px;">
          ${footerNote ? `<p style="margin:0 0 10px;color:${BRAND.muted};font-size:12px;line-height:1.5;">${esc(footerNote)}</p>` : ''}
          <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;line-height:1.6;">
            <a href="${BRAND.appUrl}" style="color:${BRAND.accent};text-decoration:none;">Open Bell</a>
            &nbsp;·&nbsp;
            <a href="${BRAND.site}" style="color:${BRAND.accent};text-decoration:none;">bell.qa</a>
            ${unsubscribeUrl ? `&nbsp;·&nbsp;<a href="${esc(unsubscribeUrl)}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe</a>` : ''}
          </p>
          <p style="margin:0;color:${BRAND.muted};font-size:11px;line-height:1.5;">
            ${esc(BRAND.address)} · © ${year} ${BRAND.name}. All rights reserved.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Convenience wrapper for admin announcements / simple message emails. */
export function renderAnnouncementEmail({ title, body, ctaText = '', ctaUrl = '', unsubscribeUrl = '' } = {}) {
  return renderEmail({
    heading: title,
    preheader: String(body || title || '').replace(/\s+/g, ' ').slice(0, 110),
    contentHtml: textToHtml(body),
    ctaText, ctaUrl, unsubscribeUrl,
  });
}

export { BRAND };
