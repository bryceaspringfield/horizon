// Groceries from each person's diet (Bryce, 2026-11-23): the USDA Food Plans' cost of food at home, a month, by age, sex, and
// one of four spending levels, with USDA's adjustment for household size. Figures: USDA's October 2026 reports (Thrifty
// Food Plan, and Cost of Food at Home at Three Levels), fns-prod.azureedge.us/sites/default/files/resource-files/
// CostofFoodOct2026Thrifty.pdf and CostofFoodOct2026LowModLib.pdf, monthly costs for individuals in 4-person households.
// Diet type is recorded but changes no cost: no reliable source was found.

export type FoodPlan = 'thrifty' | 'low' | 'moderate' | 'liberal';
export const FOOD_PLANS: [FoodPlan, string][] = [['thrifty', 'Thrifty'], ['low', 'Low-cost'], ['moderate', 'Moderate-cost'], ['liberal', 'Liberal']];
export type Diet = 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'glutenFree' | 'halalKosher' | 'other';
export const DIETS: [Diet, string][] = [['omnivore', 'No restrictions'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian'], ['keto', 'Low-carb or keto'], ['glutenFree', 'Gluten-free'], ['halalKosher', 'Halal or kosher'], ['other', 'Other']];
export const FOOD_SOURCE = 'USDA Food Plans, Cost of Food at Home, October 2026 (Thrifty, Low-Cost, Moderate-Cost, and Liberal), monthly costs by age and sex.';

/** [age from, thrifty, low, moderate, liberal], monthly, October 2026. */
type Band = [number, number, number, number, number];
const CHILD: Band[] = [[0, 114.2, 165.8, 186.9, 227.1], [2, 172.6, 173.8, 207.7, 252.8], [4, 188.5, 179.5, 222.4, 268.8], [6, 209.3, 262.1, 305.6, 357.8], [9, 242.0, 271.4, 351.2, 409.8]];
const FEMALE: Band[] = [[12, 223.9, 269.9, 322.9, 401.7], [14, 260.5, 271.4, 322.7, 399.8], [19, 254.2, 277.0, 337.0, 430.2], [51, 236.6, 269.4, 331.9, 400.4], [71, 261.4, 269.0, 331.2, 395.9]];
const MALE: Band[] = [[12, 258.6, 317.2, 393.5, 462.0], [14, 326.5, 323.0, 403.7, 475.0], [19, 319.1, 318.5, 398.9, 486.8], [51, 281.7, 299.9, 376.0, 450.4], [71, 268.7, 296.4, 365.3, 448.7]];
const COL: Record<FoodPlan, number> = { thrifty: 1, low: 2, moderate: 3, liberal: 4 };
const pick = (bands: Band[], age: number) => [...bands].reverse().find((b) => age >= b[0]) ?? bands[0];

/** One person's cost of food at home a month, before the household-size adjustment. */
export function foodMonthly(age: number, sex: 'male' | 'female' | 'unknown', plan: FoodPlan): number {
  const c = COL[plan];
  if (age < 12) return pick(CHILD, age)[c];
  if (sex === 'male') return pick(MALE, age)[c];
  if (sex === 'female') return pick(FEMALE, age)[c];
  return (pick(MALE, age)[c] + pick(FEMALE, age)[c]) / 2;
}

/** USDA's adjustment for household size: +20% for one person, +10% two, +5% three, none four, -5% five or six, -10% more. */
export function householdFactor(n: number): number {
  return n <= 1 ? 1.2 : n === 2 ? 1.1 : n === 3 ? 1.05 : n === 4 ? 1 : n <= 6 ? 0.95 : 0.9;
}

/** A household's groceries a year: each member's cost (none for one whose food others pay), adjusted for the household's size. */
export function groceriesYearly(members: { age: number; sex?: 'male' | 'female' | 'unknown'; plan?: FoodPlan; paidByOthers?: boolean }[]): number {
  const eating = members.filter((m) => !m.paidByOthers);
  const sum = eating.reduce((t, m) => t + foodMonthly(m.age, m.sex ?? 'unknown', m.plan ?? 'moderate'), 0);
  return Math.round(sum * householdFactor(eating.length) * 12);
}
