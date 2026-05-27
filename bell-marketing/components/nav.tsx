'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Wordmark } from './wordmark';
import { Megamenu } from './megamenu';
import { PRIMARY_NAV, HEADER_CTAS } from '@/content/navigation';

/**
 * Top navigation bar.
 *   - Sticky, translucent dark background w/ blur
 *   - Primary nav items left of CTAs. Items can be plain links or megamenus.
 *   - Each megamenu opens on hover with a small leave delay so moving
 *     from trigger → panel doesn't close it. Only ONE megamenu is open
 *     at a time — hovering a second trigger swaps which one shows.
 *   - Right side: Sign In (ghost) + Get Access (accent)
 *   - Mobile: hamburger → drawer with all items + nested megamenu lists
 */

const MEGA_CLOSE_DELAY = 140;     // ms — pause before closing on mouseleave

export function Nav() {
  const pathname = usePathname();

  // Mobile drawer state — per-megamenu open state keyed by label
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileMegaOpen, setMobileMegaOpen] = useState<Record<string, boolean>>({});

  // Desktop megamenu state — only one open at a time, keyed by label
  // (null = none open). Setting to a label opens that megamenu and
  // implicitly closes any other.
  const [openMega, setOpenMega] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelCloseTimer = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpenMega(null), MEGA_CLOSE_DELAY);
  };
  useEffect(() => () => cancelCloseTimer(), []);

  // All megamenu items, so we can render one <Megamenu/> per item below.
  const megaItems = PRIMARY_NAV.filter(i => i.kind === 'megamenu') as Extract<
    typeof PRIMARY_NAV[number], { kind: 'megamenu' }
  >[];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 backdrop-blur-md bg-bg/85">
      {/* The header bar is `relative` so each Megamenu (rendered as siblings
          of the nav at the bottom of this container) is positioned against
          the full-width header container — NOT against its trigger. This
          centers the panels under the whole header rather than under the
          individual nav items. */}
      <div className="relative max-w-screen-xl mx-auto px-6 h-16 flex items-center gap-6">
        <Wordmark size={18} />

        {/* Desktop primary nav */}
        <nav className="hidden lg:flex items-center gap-1 ml-2">
          {PRIMARY_NAV.map(item => {
            if (item.kind === 'megamenu') {
              const isOpen = openMega === item.label;
              return (
                <div
                  key={item.label}
                  onMouseEnter={() => { cancelCloseTimer(); setOpenMega(item.label); }}
                  onMouseLeave={scheduleClose}
                >
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    className={
                      'px-3 py-2 text-sm rounded-md transition-colors inline-flex items-center gap-1 ' +
                      (isOpen
                        ? 'text-text bg-bg-elev-2'
                        : 'text-text-muted hover:text-text hover:bg-bg-elev-2/60')
                    }
                  >
                    {item.label}
                    <ChevronDown
                      size={13}
                      className={'transition-transform ' + (isOpen ? 'rotate-180' : '')}
                    />
                  </button>
                  {/* Each megamenu's panel renders below as a sibling — see
                      the bottom of this header bar. */}
                </div>
              );
            }
            // leaf link
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'px-3 py-2 text-sm rounded-md transition-colors ' +
                  (active
                    ? 'text-text bg-bg-elev-2'
                    : 'text-text-muted hover:text-text hover:bg-bg-elev-2/60')
                }
              >
                {item.label}
                {item.comingSoon && (
                  <span className="ml-2 text-[9px] uppercase tracking-wider text-text-dim border border-border rounded px-1 py-[1px]">
                    soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Desktop CTAs */}
        <div className="hidden lg:flex items-center gap-2">
          <Link
            href={HEADER_CTAS.signIn.href}
            className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text rounded-md transition-colors"
          >
            {HEADER_CTAS.signIn.label}
          </Link>
          <Link
            href={HEADER_CTAS.getAccess.href}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition shadow-sm shadow-accent/30"
          >
            {HEADER_CTAS.getAccess.label}
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="lg:hidden p-2 -mr-2 text-text-muted hover:text-text"
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Megamenus — one per megamenu item in PRIMARY_NAV. Rendered HERE
            (siblings of nav) so their `absolute left-1/2 x:'-50%'`
            positioning centers each panel against the full-width header
            container, not against its trigger. Only one is open at a time
            (controlled by `openMega`); the others are unmounted by
            AnimatePresence. */}
        {megaItems.map(item => (
          <Megamenu
            key={item.label}
            open={openMega === item.label}
            columns={item.columns}
            ariaLabel={item.label}
            footer={item.footer}
            onRequestClose={() => setOpenMega(null)}
            onMouseEnter={cancelCloseTimer}
            onMouseLeave={scheduleClose}
          />
        ))}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-bg">
          <nav className="max-w-screen-xl mx-auto px-6 py-4 flex flex-col gap-1">
            {PRIMARY_NAV.map(item => {
              if (item.kind === 'megamenu') {
                const isOpen = !!mobileMegaOpen[item.label];
                return (
                  <div key={item.label}>
                    <button
                      type="button"
                      onClick={() => setMobileMegaOpen(prev => ({ ...prev, [item.label]: !prev[item.label] }))}
                      className="w-full text-left px-3 py-2 text-sm rounded-md text-text-muted hover:text-text hover:bg-bg-elev-2/60 inline-flex items-center justify-between"
                    >
                      <span>{item.label}</span>
                      <ChevronDown
                        size={14}
                        className={'transition-transform ' + (isOpen ? 'rotate-180' : '')}
                      />
                    </button>
                    {isOpen && (
                      <div className="pl-3 border-l border-border ml-3 my-1 flex flex-col gap-1">
                        {item.columns.map(col => (
                          <div key={col.label} className="mt-2">
                            <div className="px-3 text-[10px] uppercase tracking-wider text-text-dim font-semibold">
                              {col.label}
                            </div>
                            {col.items.map(sub => (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                onClick={() => setMobileOpen(false)}
                                className="block px-3 py-1.5 text-sm rounded-md text-text-muted hover:text-text hover:bg-bg-elev-2/60"
                              >
                                {sub.label}
                                {sub.comingSoon && (
                                  <span className="ml-2 text-[9px] uppercase tracking-wider text-text-dim">soon</span>
                                )}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-2 text-sm rounded-md text-text-muted hover:text-text hover:bg-bg-elev-2/60"
                >
                  {item.label}
                  {item.comingSoon && (
                    <span className="ml-2 text-[9px] uppercase tracking-wider text-text-dim">soon</span>
                  )}
                </Link>
              );
            })}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href={HEADER_CTAS.signIn.href}
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-text-muted border border-border"
              >
                {HEADER_CTAS.signIn.label}
              </Link>
              <Link
                href={HEADER_CTAS.getAccess.href}
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md bg-accent text-white"
              >
                {HEADER_CTAS.getAccess.label}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
