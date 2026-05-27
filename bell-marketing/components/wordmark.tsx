/**
 * Bell Data Intelligence wordmark — rendered as styled text so it scales
 * crisply at any size with no image asset. Two visual tones:
 *   - "Bell"             — bold, brighter
 *   - "Data Intelligence" — lighter weight, muted, slightly smaller
 *
 * The two tones give a confident "brand · descriptor" hierarchy without
 * resorting to a separate logo mark. The whole thing wraps in a Link to /
 * so it acts as the standard home-page navigation.
 */

import Link from 'next/link';

type Props = {
  /** Base font-size in px. The descriptor scales to ~88% of this. */
  size?: number;
  /** Use muted palette (e.g. in the footer). */
  muted?: boolean;
  /** Wrap in a Link to /, default true. */
  asLink?: boolean;
};

export function Wordmark({ size = 18, muted = false, asLink = true }: Props) {
  const inner = (
    <span
      className="inline-flex items-baseline gap-[6px] font-sans select-none whitespace-nowrap"
      style={{ fontSize: size, lineHeight: 1 }}
      aria-label="Bell Data Intelligence"
    >
      <span
        className={muted ? 'text-text-muted' : 'text-text'}
        style={{ fontWeight: 700, letterSpacing: '-0.02em' }}
      >
        Bell
      </span>
      <span
        className={muted ? 'text-text-dim' : 'text-text-muted'}
        style={{
          fontWeight: 400,
          fontSize: size * 0.88,
          letterSpacing: '-0.005em',
        }}
      >
        Data Intelligence
      </span>
    </span>
  );
  if (!asLink) return inner;
  return (
    <Link
      href="/"
      className="inline-flex items-baseline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {inner}
    </Link>
  );
}
