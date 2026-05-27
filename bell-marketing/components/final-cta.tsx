import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Final CTA — sits just above the footer. Big, confident, with a glow.
 */
export function FinalCta() {
  return (
    <section className="relative max-w-screen-xl mx-auto px-6 pb-16">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-elev p-12 md:p-16 text-center">
        {/* Accent glow */}
        <div className="absolute inset-0 bg-accent-glow opacity-50 pointer-events-none" />
        <div className="relative">
          <h2 className="text-display-md text-gradient max-w-2xl mx-auto">
            Ready to see Qatar clearly?
          </h2>
          <p className="mt-5 text-lg text-text-muted max-w-xl mx-auto">
            Get in touch and we'll walk you through what Bell.qa can do for
            your team.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium rounded-md bg-accent text-white hover:brightness-110 transition shadow-lg shadow-accent/30"
            >
              Get in touch
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/platform"
              className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md text-text-muted hover:text-text"
            >
              Explore the platform →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
