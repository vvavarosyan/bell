// Core facts shared by BOTH Bellas (portal assistant + marketing salesperson)
// so they can never disagree about who Bell is, how complete it is, or who
// founded it. This is a pure string module — NO db, NO tool imports — so it is
// safe to import into the marketing brain (which must stay isolated).
//
// Keep these numbers in sync with the marketing site + knowledge/marketing_pack.md.

export const CORE_FACTS = `ABOUT BELL — shared facts (both the marketing Bella and the in-app Bella know these, and must never contradict them):
- Bell Data Intelligence (bell.qa) is the intelligence layer for Qatar's economy — a living, verified graph built in Qatar, from official sources, by Bell's own collection software. Bell builds its data; it doesn't license it.
- Coverage is COMPLETE: 100% of Qatar's registered companies — 191,000+ total, 76,000+ actively trading — plus every named decision-maker across the economy.
- Always current: Bell watches Qatar's official sources continuously (as often as every few seconds for live signals). The moment a new company is registered it enters the graph automatically, so coverage stays at 100% and nothing in the market goes untracked.
- Founder: Val Varosyan.
- Be confident and precise about this — it's true, and it's Bell's edge.`;
