# Qatar Official Data Sources — Feasibility Assessment
_Recon date: 2026-06-06. Goal: which official registries can feed Bell's company database, how hard each is, and in what order to do them._

## TL;DR

None of these are free static-HTML wins — every Qatar government portal is JavaScript-rendered, bot-protected (CAPTCHA/Cloudflare), or login-gated. So they all follow the **qatarcid playbook**: Firecrawl now / residential proxies later. The financial regulators (QCB, QFMA, CRA) are **low volume and overlap** sources you already have (QSE, QFC), so they're low priority. The real prizes are **MoPH (health facilities), MoE (private schools), Qatar Tourism (hotels/agencies), and Ashghal (contractors/vendors)** — all medium volume, all protected.

## Comparison

| Source | What it lists | Est. volume | Accessibility (tested) | Approach | Priority |
|---|---|---|---|---|---|
| **MoPH** — Ministry of Public Health | Licensed private health facilities (clinics, pharmacies, hospitals, medical centres); DHP also licenses practitioners (people) | ~1,000–2,000 facilities (+ tens of thousands of practitioners) | **Bot-protected** — e-register threw a CAPTCHA on fetch | Firecrawl / proxy | **High** |
| **MoE** — Ministry of Education | Licensed private schools & kindergartens; training centres | ~600 schools + centres | **JS app** (interactive map + chatbot; data on myschools.edu.gov.qa portal) | Firecrawl / proxy; find portal API | **High** |
| **Qatar Tourism / Visit Qatar** | Hotels, travel agencies, tour operators, tourism offices | ~150–200 hotels + hundreds of agencies | Licensing pages = info only; official register login-gated; **but visitqatar.com has a public hotels directory** | Firecrawl the consumer hotel listings | **Medium-High** |
| **Ashghal** — Public Works Authority | Approved Vendors List (Ta'heel): contractors, suppliers, manufacturers, service providers | Hundreds–low thousands | `.aspx` portal, likely registration/login-gated | Firecrawl / proxy; confirm gating | **Medium** |
| **QCB** — Qatar Central Bank | Licensed banks, insurers, exchange houses, finance & payment cos | <100 (16 banks + ~dozens) | Static pages / PDFs | Small static/PDF scrape (or manual) | **Low** (high-value entities but few; overlaps QSE/QFC) |
| **QFMA** — Financial Markets Authority | Licensed financial-services firms (brokers, custodians, advisors) | ~30–60 firms | JS / fetch returned empty | Firecrawl small pull | **Low** (overlaps QFC/QSE) |
| **CRA** — Communications Regulatory Authority | Telecom/ICT/postal licensees | <20 meaningful | Small/static | Manual / skip | **Skip** (Ooredoo, Vodafone, Starlink + a handful) |

## Recommended order

1. **Finish qatarcid** (in progress) — by far the largest single source (tens of thousands).
2. **Once residential proxies are in** (free bulk), run the four medium sources in this order: **MoPH → MoE → Qatar Tourism → Ashghal.** All are protected/JS, so proxies make them cheap; the qatarcid scraper architecture (enumerate → fetch → parse) ports directly to each.
3. **Optional quick wins:** a one-time small pull of **QCB + QFMA** for the high-value financial entities (banks, insurers, brokers) — few in number, partly already covered by QSE/QFC, so do them only if you want 100% completeness. **CRA: skip** (handful of licensees, add manually if ever needed).

## Notes
- MoPH's practitioner register (DHP) is a strong **people** source (doctors, pharmacists) that could feed the People side of Bell and link to the facilities as employers — worth a dedicated pass later.
- Because all four medium sources are protected, there's little benefit to building them now on Firecrawl credits when proxies will do them free shortly — recommend queuing them behind the proxy switch, except for spot-testing.
