import Link from 'next/link';
import { Wordmark } from './wordmark';
import { FOOTER_NAV, FOOTER_LEGAL, FOOTER_SYSTEM } from '@/content/navigation';

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
