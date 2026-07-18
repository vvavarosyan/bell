// Public unsubscribe endpoint for Bell's outreach. NOT Clerk-gated — recipients are not
// logged in. Mounted at /u.
//
//   POST /u/:token  → one-click unsubscribe (RFC 8058; mail clients POST automatically for
//                     List-Unsubscribe-Post). Performs the opt-out immediately.
//   GET  /u/:token  → a human clicked the link: show a small bilingual page with a button
//                     that POSTs. GET does NOT auto-unsubscribe, so email link-scanners can't
//                     opt someone out by merely following the URL.

import express from 'express';
import { unsubscribeByToken } from '../outreach/optout.js';

const router = express.Router();

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page({ title, bodyEn, bodyAr, token, showButton }) {
  const btn = showButton
    ? `<form method="POST" action="/u/${esc(token)}" style="margin-top:22px">
         <button type="submit" style="background:#5b8cff;color:#fff;border:none;border-radius:8px;padding:11px 22px;font-size:15px;font-weight:600;cursor:pointer">Unsubscribe · إلغاء الاشتراك</button>
       </form>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0f1420;color:#e6ebf5;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center">
  <div style="max-width:460px;padding:36px 30px;text-align:center">
    <div style="font-weight:700;font-size:13px;letter-spacing:.08em;color:#8ea2c6;text-transform:uppercase">Bell Data Intelligence</div>
    <p style="font-size:16px;line-height:1.55;margin:18px 0 6px">${bodyEn}</p>
    <p dir="rtl" lang="ar" style="font-size:16px;line-height:1.7;color:#c7d2e8;margin:6px 0">${bodyAr}</p>
    ${btn}
  </div>
</body></html>`;
}

router.get('/:token', (req, res) => {
  res.status(200).send(page({
    title: 'Unsubscribe — Bell',
    bodyEn: 'Stop receiving emails from Bell?',
    bodyAr: 'هل تريد إيقاف تلقّي رسائل بريد من Bell؟',
    token: req.params.token,
    showButton: true,
  }));
});

router.post('/:token', async (req, res) => {
  const r = await unsubscribeByToken(req.params.token, {
    ip: req.headers['x-forwarded-for'] || req.ip || null,
    userAgent: req.get('user-agent') || null,
  }).catch(() => ({ ok: false }));
  // Always 200 for one-click (RFC 8058 clients expect a success); tell the human plainly.
  res.status(200).send(page({
    title: r.ok ? 'Unsubscribed — Bell' : 'Unsubscribe — Bell',
    bodyEn: r.ok ? "You've been unsubscribed. You won't receive further emails from Bell." : 'This unsubscribe link is not valid.',
    bodyAr: r.ok ? 'تم إلغاء اشتراكك. لن تتلقّى أي رسائل أخرى من Bell.' : 'رابط إلغاء الاشتراك غير صالح.',
    showButton: false,
  }));
});

export default router;
