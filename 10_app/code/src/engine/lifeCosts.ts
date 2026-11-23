// Starting cost estimates for planned life events (Bryce, 2026-11-23): weddings by style and size, pregnancy and birth,
// and adoption by route, each from a published figure, with the source beside it. The user can replace any estimate.

export type WeddingStyle = 'courthouse' | 'small' | 'midsize' | 'large' | 'religious' | 'southAsian' | 'extravagant';
export const WEDDING_STYLES: [WeddingStyle, string][] = [
  ['courthouse', 'Courthouse or elopement'], ['small', 'Small (up to 50 guests)'], ['midsize', 'Mid-size (51 to 100 guests)'], ['large', 'Large (over 100 guests)'],
  ['religious', 'Church, temple, or other religious ceremony (Protestant, Catholic, Jewish, and others)'],
  ['southAsian', 'Multi-day South Asian (Telugu, Tamil, Gujarati, Punjabi, and other Indian weddings)'], ['extravagant', 'Luxury'],
];
export type Destination = 'home' | 'domestic' | 'international';

export interface WeddingInputs { style: WeddingStyle; guests: number; days: number; locations: number; destination: Destination; dayFactor?: number; placeFactor?: number }

export const WEDDING_SOURCES = [
  'The Knot 2026 Real Weddings Study (couples married in 2025): $34,200 on average, $292 a guest; $17,100 for 1 to 50 guests, $27,200 for 51 to 100, $43,300 above 100; a hometown wedding $32,600, a domestic destination $41,700, an international one $43,700.',
  'Multi-day South Asian weddings in the US: about $400 to $800 a guest across all events (industry guides, 2026; not a formal survey); $600 is used.',
  'Assumed, no published source: each extra day adds 30% and each extra location 15% (editable).',
];

/** A wedding's estimated cost in today's dollars. */
export function weddingCost(x: WeddingInputs): number {
  const perGuest = x.style === 'southAsian' ? 600 * Math.max(1, x.days) / 3 : x.style === 'extravagant' ? 600 : 292;
  let base: number;
  if (x.style === 'courthouse') base = 300;
  else if (x.style === 'small') base = x.guests ? x.guests * perGuest : 17100;
  else if (x.style === 'midsize') base = x.guests ? x.guests * perGuest : 27200;
  else if (x.style === 'large') base = x.guests ? x.guests * perGuest : 43300;
  else base = Math.max(5000, (x.guests || 117) * perGuest);
  const dest = x.destination === 'domestic' ? 41700 / 32600 : x.destination === 'international' ? 43700 / 32600 : 1;
  const days = x.style === 'southAsian' || x.style === 'courthouse' ? 1 : 1 + (x.dayFactor ?? 0.3) * Math.max(0, x.days - 1);
  const places = 1 + (x.placeFactor ?? 0.15) * Math.max(0, x.locations - 1);
  return Math.round(base * dest * days * places);
}

export type BirthCover = 'employer' | 'medicaid' | 'uninsured';
export const BIRTH_SOURCE = 'Peterson-KFF Health System Tracker, 2024 (employer plans, 2021 to 2023 claims): pregnancy, birth, and postpartum care $20,416 in all, $2,563 out of pocket for a vaginal birth and $3,071 for a cesarean; a newborn $5,820 in all, $475 out of pocket. Medicaid, which covers about 4 in 10 births, has little cost sharing.';

/** The out-of-pocket cost of a pregnancy and birth, mother and newborn, in today's dollars. */
export function birthCost(cover: BirthCover, cesarean: boolean): number {
  if (cover === 'medicaid') return 0;
  if (cover === 'uninsured') return 20416 + 5820;
  return (cesarean ? 3071 : 2563) + 475;
}

export type AdoptionRoute = 'foster' | 'agency' | 'independent' | 'intercountry';
export const ADOPTION_ROUTES: [AdoptionRoute, string][] = [['foster', 'From foster care'], ['agency', 'Private agency (domestic infant)'], ['independent', 'Independent (through an attorney)'], ['intercountry', 'Intercountry']];
export const ADOPTION_SOURCE = 'Child Welfare Information Gateway, Planning for Adoption: Knowing the Costs and Resources: foster care nearly free (fees usually reimbursed, up to about $2,000); a private agency about $30,000 to $60,000; independent about $15,000 to $40,000; intercountry about $20,000 to $50,000. Midpoints are used.';

export function adoptionCost(route: AdoptionRoute): number {
  return route === 'foster' ? 1000 : route === 'agency' ? 45000 : route === 'independent' ? 27500 : 35000;
}
