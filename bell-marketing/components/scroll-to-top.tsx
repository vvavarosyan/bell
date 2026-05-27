'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Mount once in the root layout. Watches `pathname` and snaps the window
 * scroll to (0, 0) on every route change.
 *
 * Why this is needed even though Next.js App Router auto-scrolls on most
 * navigations: with our sticky header + flex column layout, the scroll
 * restoration sometimes preserves the previous page's scroll position when
 * Link is clicked. This guarantees every new page starts at the very top.
 *
 * Uses `behavior: 'instant'` (not 'smooth') because Val wants the page to
 * start at the top, not animate to it.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    } catch {
      // Older browsers may not support 'instant' — fall back to plain scroll.
      window.scrollTo(0, 0);
    }
  }, [pathname]);
  return null;
}
