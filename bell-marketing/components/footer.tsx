import Link from 'next/link';
import { Wordmark } from './wordmark';
import { FOOTER_NAV, FOOTER_LEGAL, FOOTER_SYSTEM, SOCIAL_LINKS } from '@/content/navigation';

/** Inline brand icons (lucide has no TikTok / current X mark — keep the set
 *  visually consistent by drawing all five the same way). */
const SOCIAL_ICONS: Record<string, JSX.Element> = {
  LinkedIn: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  ),
  X: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M18.9 2.1h3.68l-8.04 9.19L24 23.9h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 2.1h7.59l5.24 6.93L18.9 2.1zm-1.29 19.6h2.04L6.49 4.16H4.3L17.61 21.7z" />
    </svg>
  ),
  Instagram: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Facebook: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z" />
    </svg>
  ),
  TikTok: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.9 2.9 0 1 1-2.03-2.77V9.39a6.34 6.34 0 1 0 4.44 6.05V8.86a8.16 8.16 0 0 0 4.81 1.56V6.99c-.34 0-.68-.03-1-.1z" />
    </svg>
  ),
};

/** Tiny helper for the small "soon" badge used in legal/system rows. */
function SoonChip() {
  return (
    <span className="ml-1 text-[9px] uppercase tracking-wider text-text-dim">
      soon
    </span>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border mt-32">
      <div className="max-w-screen-xl mx-auto px-6 py-16">
        {/* Top — brand + link columns. Layout: brand (1) + groups.
            A `wide: true` group takes 2 columns and renders its links
            in a 2-column subgrid with column-major flow.
            Total slots = 1 (brand) + sum of group widths. */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10">
          <div className="col-span-2 md:col-span-1">
            <Wordmark size={18} />
            <p className="mt-4 text-sm text-text-dim leading-relaxed max-w-xs">
              The intelligence layer for Qatar&apos;s economy.
            </p>
            {/* Social profiles — also mirrored in the Organization JSON-LD sameAs. */}
            <div className="mt-5 flex items-center gap-3">
              {SOCIAL_LINKS.map(s => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Bell Data Intelligence on ${s.label}`}
                  title={s.label}
                  className="text-text-dim hover:text-text transition-colors"
                >
                  {SOCIAL_ICONS[s.label] ?? s.label}
                </a>
              ))}
            </div>
          </div>
          {FOOTER_NAV.map(group => (
            <div
              key={group.label}
              className={group.wide ? 'col-span-2 md:col-span-2' : ''}
            >
              <h4 className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-4">
                {group.label}
              </h4>
              <ul
                className={
                  group.wide
                    ? 'grid grid-cols-2 grid-flow-col gap-x-6 gap-y-2'
                    : 'space-y-2'
                }
                style={
                  group.wide
                    ? { gridTemplateRows: `repeat(${Math.ceil(group.links.length / 2)}, minmax(0, auto))` }
                    : undefined
                }
              >
                {group.links.map(link => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={
                        'text-sm transition-colors ' +
                        (link.comingSoon
                          ? 'text-text-dim hover:text-text-muted'
                          : 'text-text-muted hover:text-text')
                      }
                    >
                      {link.label}
                      {link.comingSoon && <SoonChip />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom — copyright + legal + system */}
        <div className="mt-16 pt-8 border-t border-border flex flex-col gap-5 text-sm text-text-dim">
          {/* Row 1 — copyright + legal links */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>© {new Date().getFullYear()} Bell.qa. All rights reserved.</div>
            <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
              {FOOTER_LEGAL.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-text-muted whitespace-nowrap"
                >
                  {link.label}
                  {link.comingSoon && <SoonChip />}
                </Link>
              ))}
            </div>
          </div>

          {/* Row 2 — system / AI / sitemap links */}
          <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-xs">
            {FOOTER_SYSTEM.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-text-muted whitespace-nowrap"
              >
                {link.label}
                {link.comingSoon && <SoonChip />}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
