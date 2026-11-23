// An expected age at death (Bryce, 2026-11-23: fill it in from a person's birth date, sex, race, and known health
// conditions). Remaining life expectancy at the person's exact age comes from the SSA's period life table by sex; race
// and Hispanic origin scale it by the group's remaining life expectancy over all origins' at that age (NCHS 2022); each
// condition subtracts the years it costs on average, scaled down at older ages in proportion to remaining life.
import race from '../data/life_by_race.json';
import table from '../data/life_table.json';

export type Sex = 'male' | 'female' | 'unknown';
export type Race = 'all' | 'hispanic' | 'aian' | 'asian' | 'black' | 'white';
export const RACES: [Race, string][] = [['all', 'Not given'], ['hispanic', 'Hispanic'], ['aian', 'American Indian or Alaska Native'], ['asian', 'Asian'], ['black', 'Black'], ['white', 'White']];

/** Conditions and the years each costs at the reference age, with the study each comes from. */
export const CONDITIONS: { key: string; label: string; years: number; atAge: number; source: string }[] = [
  { key: 'smoker', label: 'Smokes', years: 10, atAge: 40, source: 'Jha et al., NEJM 2013: current smokers lose about 10 years against never-smokers.' },
  { key: 'diabetes', label: 'Diabetes', years: 6, atAge: 60, source: 'Emerging Risk Factors Collaboration, JAMA 2015: about 6 years lost at age 60.' },
  { key: 'heartAttack', label: 'Past heart attack', years: 7, atAge: 60, source: 'Emerging Risk Factors Collaboration, JAMA 2015: about 7 years lost at age 60.' },
  { key: 'stroke', label: 'Past stroke', years: 7, atAge: 60, source: 'Emerging Risk Factors Collaboration, JAMA 2015: about 7 years lost at age 60.' },
  { key: 'obesity', label: 'Severe obesity (BMI 35 or more)', years: 5, atAge: 45, source: 'Life years lost to obesity-related disease, US nonsmokers aged 40 to 49 (PMC3688902): about 5 years.' },
];

/** Remaining years at a fractional age from the SSA table (an unknown sex averages the two). */
function remaining(age: number, sex: Sex): number {
  const f = (s: 'male' | 'female') => {
    const t = table[s], a = Math.max(0, Math.min(t.length - 1, age)), lo = Math.floor(a), hi = Math.min(t.length - 1, lo + 1);
    return t[lo] + (t[hi] - t[lo]) * (a - lo);
  };
  return sex === 'unknown' ? (f('male') + f('female')) / 2 : f(sex);
}

/** The race factor at an age: the group's remaining years over all origins' (NCHS ages 0, 1, 5, ..., 100, interpolated). */
function raceFactor(age: number, sex: Sex, r: Race): number {
  if (r === 'all') return 1;
  const ages = race.ages as number[];
  const at = (g: Race, s: 'male' | 'female') => {
    const v = (race as unknown as Record<string, Record<string, number[]>>)[g][s];
    const a = Math.max(0, Math.min(ages[ages.length - 1], age));
    let k = ages.findIndex((x) => x > a); if (k <= 0) k = k === 0 ? 1 : ages.length - 1;
    const t = (a - ages[k - 1]) / (ages[k] - ages[k - 1]);
    return v[k - 1] + (v[k] - v[k - 1]) * Math.max(0, Math.min(1, t));
  };
  const one = (s: 'male' | 'female') => at(r, s) / at('all', s);
  return sex === 'unknown' ? (one('male') + one('female')) / 2 : one(sex);
}

/** The expected age at death of a person of an exact age, with their conditions. */
export function expectedAgeAtDeath(age: number, sex: Sex, r: Race = 'all', conditions: string[] = []): number {
  let rest = remaining(age, sex) * raceFactor(age, sex, r);
  for (const key of conditions) {
    const c = CONDITIONS.find((x) => x.key === key);
    if (!c) continue;
    const scale = remaining(age, sex) / remaining(c.atAge, sex);
    rest -= c.years * Math.min(1, scale);
  }
  return age + Math.max(0.5, rest);
}

/** The expected date of death (YYYY-MM-DD) from a birth date and the person's details, as of a date. */
export function expectedDeathDate(birth: string, sex: Sex, r: Race, conditions: string[], asOf = new Date()): { date: string; age: number } {
  const b = new Date(birth + 'T12:00:00Z');
  const age = (asOf.getTime() - b.getTime()) / (365.2425 * 864e5);
  const at = expectedAgeAtDeath(Math.max(0, age), sex, r, conditions);
  const d = new Date(b.getTime() + at * 365.2425 * 864e5);
  return { date: d.toISOString().slice(0, 10), age: at };
}
