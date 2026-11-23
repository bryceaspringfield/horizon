// Currencies: a plan has one currency (every result is in it), and an account, an income, or an expense may be held in
// another. A foreign amount is converted with the plan's exchange-rate assumption for its currency: the rate today
// (units of the plan's currency for one unit of the foreign one) and a yearly change of the rate.
//
// convertCurrencies turns a plan's foreign items into the plan's currency before a simulation:
//   - an income or expense: its amounts at today's rate, and its yearly growth compounded with the rate's yearly change;
//   - an asset or a debt: its balance (and rent, payments) at today's rate, its appreciation or interest rate compounded
//     with the rate's yearly change;
//   - a cash or investment account: its balance and cost basis at today's rate; an account with a return of its own has
//     the rate's change compounded into the return, and an account on the market assumptions follows them unchanged.
import type { Plan } from './types';

/** ISO 4217 codes offered, with their names; any code a file holds still formats and converts. */
export const CURRENCIES: [string, string][] = [
  ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'Pound sterling'], ['CAD', 'Canadian dollar'], ['AUD', 'Australian dollar'], ['NOK', 'Norwegian krone'],
  ['CHF', 'Swiss franc'], ['CNY', 'Chinese yuan'], ['BRL', 'Brazilian real'], ['ILS', 'Israeli new shekel'], ['HKD', 'Hong Kong dollar'], ['SGD', 'Singapore dollar'],
  ['NZD', 'New Zealand dollar'], ['MXN', 'Mexican peso'], ['ARS', 'Argentine peso'], ['INR', 'Indian rupee'], ['IDR', 'Indonesian rupiah'], ['PKR', 'Pakistani rupee'],
  ['RUB', 'Russian ruble'], ['JPY', 'Japanese yen'], ['NGN', 'Nigerian naira'], ['BDT', 'Bangladeshi taka'], ['EGP', 'Egyptian pound'], ['VND', 'Vietnamese dong'],
  ['IRR', 'Iranian rial'], ['PHP', 'Philippine peso'], ['TRY', 'Turkish lira'], ['THB', 'Thai baht'], ['ZAR', 'South African rand'], ['KRW', 'South Korean won'],
  ['COP', 'Colombian peso'], ['IQD', 'Iraqi dinar'], ['SAR', 'Saudi riyal'], ['DZD', 'Algerian dinar'], ['MYR', 'Malaysian ringgit'], ['MAD', 'Moroccan dirham'],
  ['UZS', 'Uzbekistani som'], ['PLN', 'Polish zloty'], ['UAH', 'Ukrainian hryvnia'], ['ETB', 'Ethiopian birr'], ['PEN', 'Peruvian sol'], ['GHS', 'Ghanaian cedi'],
  ['TWD', 'New Taiwan dollar'], ['KES', 'Kenyan shilling'], ['KZT', 'Kazakhstani tenge'], ['CLP', 'Chilean peso'], ['RON', 'Romanian leu'], ['AED', 'UAE dirham'],
  ['SEK', 'Swedish krona'], ['DKK', 'Danish krone'], ['CZK', 'Czech koruna'], ['HUF', 'Hungarian forint'], ['BGN', 'Bulgarian lev'], ['ISK', 'Icelandic króna'],
  ['QAR', 'Qatari riyal'], ['KWD', 'Kuwaiti dinar'], ['JOD', 'Jordanian dinar'], ['LKR', 'Sri Lankan rupee'], ['NPR', 'Nepalese rupee'], ['TZS', 'Tanzanian shilling'],
  ['XOF', 'West African CFA franc'], ['XAF', 'Central African CFA franc'], ['DOP', 'Dominican peso'], ['GTQ', 'Guatemalan quetzal'], ['UYU', 'Uruguayan peso'],
];

export const planCurrency = (plan: Plan) => plan.currency ?? 'USD';

/** The foreign currencies a plan's items use, in first-use order. */
export function foreignCurrencies(plan: Plan): string[] {
  const home = planCurrency(plan);
  const all = [...plan.accounts, ...plan.incomes, ...plan.expenses].map((x) => x.currency).filter((c): c is string => !!c && c !== home);
  return [...new Set(all)];
}

const compound = (a: number, b: number) => (1 + a) * (1 + b) - 1;

/** Converts every foreign item into the plan's currency, in place; a converted item loses its currency mark, so a
 *  second call changes nothing. */
export function convertCurrencies(plan: Plan): Plan {
  const home = planCurrency(plan);
  const fx = (c: string | undefined) => (c && c !== home ? plan.assumptions.fx?.[c] ?? { rate: 1, drift: 0 } : null);
  for (const a of plan.accounts) {
    const f = fx(a.currency);
    delete a.currency;
    if (!f) continue;
    a.balance *= f.rate;
    for (const k of ['costBasis', 'payment', 'extraPayment', 'rent'] as const) if (a[k] !== undefined) a[k] = a[k]! * f.rate;
    if (a.kind === 'asset') a.appreciation = compound(a.appreciation ?? 0, f.drift);
    else if (a.kind === 'debt') a.interestRate = compound(a.interestRate ?? 0, f.drift);
    else if (a.customReturn !== undefined) a.customReturn = compound(a.customReturn, f.drift);
  }
  for (const x of [...plan.incomes, ...plan.expenses]) {
    const f = fx(x.currency);
    delete x.currency;
    if (!f) continue;
    x.amount *= f.rate;
    x.steps?.forEach((s) => { s.amount *= f.rate; });
    x.growth = compound(x.growth, f.drift);
  }
  return plan;
}

const formatters = new Map<string, Intl.NumberFormat>();
/** An amount in a currency, with no decimals: "$1,200", "€1,200", "kr 1,200"; compact gives "$1.2K". */
export function formatMoney(v: number, code: string, compact = false): string {
  const key = code + (compact ? ':c' : '');
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard' });
    } catch {
      f = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard' });
    }
    formatters.set(key, f);
  }
  return f.format(v || 0);
}
