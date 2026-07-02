/**
 * Shared long-form document shell — legal pages, About, Support, and other
 * text-first pages. Pairs with the `.doc-prose` typography block in
 * globals.css so every document page reads consistently and stays on-brand.
 */
import type { ReactNode } from 'react';

type Props = {
  eyebrow:  string;
  title:    string;
  /** e.g. "2 July 2026" — rendered as "Last updated". */
  updated?: string;
  /** Lead paragraph under the title. */
  intro?:   string;
  /** Optional notice band (e.g. "draft pending counsel"). */
  notice?:  ReactNode;
  children: ReactNode;
};

export function DocPage({ eyebrow, title, updated, intro, notice, children }: Props) {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-24 pb-32">
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
        {eyebrow}
      </div>
      <h1 className="text-display-md text-gradient mb-3">{title}</h1>
      {updated && (
        <p className="text-xs text-text-dim mb-4">Last updated: {updated}</p>
      )}
      {notice && (
        <div className="mt-4 mb-8 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-text-muted leading-relaxed">
          {notice}
        </div>
      )}
      {intro && (
        <p className="text-lg text-text-muted leading-relaxed mb-10">{intro}</p>
      )}
      <div className="doc-prose">{children}</div>
    </div>
  );
}
