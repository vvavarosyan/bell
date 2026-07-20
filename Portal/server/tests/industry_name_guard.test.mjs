// Tests for the name-contradiction guard in deriveIndustries (lib/industry.js).
// A decisive consumer-trade name must override an incompatible source category,
// and must NEVER touch a genuine Oil/Bank/Agri company. Run: node tests/industry_name_guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveIndustries, nameTradeSignal } from '../lib/industry.js';

test('nameTradeSignal fires on decisive trade words only', () => {
  assert.equal(nameTradeSignal('The Refinery Barbershop')?.canon, 'Beauty & Wellness');
  assert.equal(nameTradeSignal('Al Amani Haircutting Salon')?.canon, 'Beauty & Wellness');
  assert.equal(nameTradeSignal('Fresh Look Salon & Spa')?.canon, 'Beauty & Wellness');
  assert.equal(nameTradeSignal('Attractive For Dry Cleaning')?.canon, 'Facilities & Cleaning');
  assert.equal(nameTradeSignal('City Laundry')?.canon, 'Facilities & Cleaning');
  assert.equal(nameTradeSignal('Al Noor Pharmacy')?.canon, 'Healthcare');
  assert.equal(nameTradeSignal('Turkey Central Restaurant')?.canon, 'Hospitality & F&B');
});

test('nameTradeSignal does NOT fire on non-decisive / unrelated names', () => {
  assert.equal(nameTradeSignal('Salon Furniture Trading'), null);   // "salon" alone is not decisive
  assert.equal(nameTradeSignal('Qatar Petroleum'), null);
  assert.equal(nameTradeSignal('Doha Bank'), null);
  assert.equal(nameTradeSignal('Gulf Oil Field Services'), null);
  assert.equal(nameTradeSignal('Al Faisal Trading & Contracting'), null);
});

test('guard: bad QCCI category → corrected to the name trade', () => {
  // A salon QCCI-filed under "Investment" (→ Banking) must become Beauty & Wellness.
  const salon = deriveIndustries({ name: 'Fresh Look Salon & Spa', extra: { qcci_category: 'Investment', qcci_sub_category: 'Body And Foot Cater' } });
  assert.equal(salon.primary, 'Beauty & Wellness');
  assert.ok(!salon.tags.includes('Banking & Finance'));

  // A dry-cleaner QCCI-filed under "Petroleum Services" (→ Oil & Gas) → Facilities & Cleaning.
  const dry = deriveIndustries({ name: 'Attractive For Dry Cleaning', sector: 'Petroleum Services', extra: { qcci_sub_category: 'Petroleum Services' } });
  assert.equal(dry.primary, 'Facilities & Cleaning');
  assert.ok(!dry.tags.includes('Oil & Gas'));
  assert.ok(!dry.tags.some((t) => /petroleum/i.test(t)), 'contradicting specific trade dropped too');
});

test('guard: barbershop with an oily name keyword → Beauty, not Oil & Gas', () => {
  const barber = deriveIndustries({ name: 'The Refinery Barbershop', description: 'Refinery Barbershop and Studio' });
  assert.equal(barber.primary, 'Beauty & Wellness');
  assert.ok(!barber.tags.includes('Oil & Gas'));
});

test('guard keeps a compatible secondary trade', () => {
  // A men's salon that also trades: Beauty wins primary, Trading survives, Oil/Auto dropped.
  const d = deriveIndustries({ name: "Inspiration Gents Salon", extra: { qcci_sub_category: 'Automobile Parts And Oils', qcci_category: 'Trade' } });
  assert.equal(d.primary, 'Beauty & Wellness');
  assert.ok(!d.tags.includes('Oil & Gas'));
});

test('guard NEVER touches a genuine Oil / Bank / Agri company (no name signal)', () => {
  const oil = deriveIndustries({ name: 'Gulf Marine Services LLC', sector: 'Petroleum Services', extra: { qcci_sub_category: 'Petroleum Services' } });
  assert.ok(oil.tags.includes('Oil & Gas'), 'real oil company keeps Oil & Gas');
  const bank = deriveIndustries({ name: 'Investment House', extra: { qcci_category: 'Investment' } });
  assert.ok(bank.tags.includes('Banking & Finance'), 'real investment firm keeps Banking');
});
