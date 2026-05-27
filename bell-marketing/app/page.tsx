import { HeroGlobe } from '@/components/hero-globe';
import { HeroSignalCards } from '@/components/hero-signal-cards';
import { HeroOverlay } from '@/components/hero-overlay';
import { HeroStatsBar } from '@/components/hero-stats-bar';
import { FeatureHighlights } from '@/components/feature-highlights';
import { BellaSection } from '@/components/bella-section';
import { FinalCta } from '@/components/final-cta';

export default function HomePage() {
  return (
    <>
      {/* HERO
          Note the EXPLICIT height (h-[88vh]) rather than min-h. The map is
          `absolute inset-0` inside this section, and absolute children take
          their containing block's COMPUTED height — with min-h alone, the
          flex layout could collapse the height. Explicit height guarantees
          the map has pixels to render into. */}
      <section className="relative h-[88vh] min-h-[640px] overflow-hidden">
        <HeroGlobe />
        <HeroSignalCards />
        <div className="absolute inset-0 flex items-center pointer-events-none">
          <div className="w-full pointer-events-auto">
            <HeroOverlay />
          </div>
        </div>
        {/* Stats bar at the bottom of the hero — slides up with the overlay */}
        <HeroStatsBar />
      </section>

      <FeatureHighlights />
      <BellaSection />
      <FinalCta />
    </>
  );
}
