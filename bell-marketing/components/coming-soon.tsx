import Link from 'next/link';
import { Clock } from 'lucide-react';

type Props = {
  title:       string;
  description: string;
};

/**
 * Shared placeholder for reserved routes (docs / blog / companies / research /
 * news / our-data / free-tools) until they get real content. The route still
 * indexes correctly and has its own metadata — only the body is a placeholder.
 */
export function ComingSoon({ title, description }: Props) {
  return (
    <div className="max-w-prose-narrow mx-auto px-6 py-32 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-bg-elev-2 border border-border text-text-muted text-xs font-medium uppercase tracking-wider">
        <Clock size={12} />
        Coming soon
      </div>
      <h1 className="text-display-md text-gradient mb-4">{title}</h1>
      <p className="text-text-muted text-lg leading-relaxed mb-10">{description}</p>
      <Link
        href="/contact"
        className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition"
      >
        Get notified when this launches
      </Link>
    </div>
  );
}
