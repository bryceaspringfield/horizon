// Bank and card statements (Bryce, 2026-11-23): CSV and OFX/QFX exports parsed in the browser into a spending log, each
// transaction put in a card spending category by its merchant, duplicates dropped, and the log summed by month and category.
import type { SpendCategory } from './cards';

export interface Txn { id: string; date: string; description: string; amount: number; category: SpendCategory | 'income' | 'transfer'; source: string }

const MERCHANTS: [RegExp, Txn['category']][] = [
  [/payroll|direct dep|salary|paycheck/i, 'income'],
  [/transfer|xfer|zelle|venmo|cash app|payment thank you|autopay|online payment|credit card payment/i, 'transfer'],
  [/whole foods|trader joe|stop ?& ?shop|market basket|kroger|safeway|aldi|wegmans|publix|costco|sam'?s club|grocery|supermarket|instacart/i, 'groceries'],
  [/restaurant|cafe|coffee|starbucks|dunkin|mcdonald|chipotle|doordash|grubhub|uber ?eats|pizza|sweetgreen|bar & grill|diner/i, 'dining'],
  [/shell|exxon|mobil|chevron|sunoco|citgo|bp |speedway|gulf oil|gas station|ev ?charg|chargepoint|tesla supercharg/i, 'gas'],
  [/airline|delta|united|american air|jetblue|southwest|marriott|hilton|hyatt|airbnb|expedia|booking\.com|hotel/i, 'travel'],
  [/mbta|charlie|metro|transit|amtrak|uber|lyft|parking|toll|ez ?pass/i, 'transit'],
  [/amazon|amzn|ebay|etsy|target\.com|walmart\.com|best buy|newegg/i, 'online'],
  [/netflix|spotify|hulu|disney|hbo|max\.com|youtube premium|apple\.com\/bill|paramount|peacock/i, 'streaming'],
  [/cvs|walgreens|rite aid|pharmacy/i, 'drugstore'],
  [/eversource|national grid|comcast|xfinity|verizon|at&t|t-mobile|mint mobile|water|electric|utility/i, 'utilities'],
  [/cinema|amc |regal|ticketmaster|steam|playstation|xbox|nintendo|concert/i, 'entertainment'],
];

export function categorize(description: string, amount: number): Txn['category'] {
  for (const [re, c] of MERCHANTS) if (re.test(description)) return c;
  return amount > 0 ? 'income' : 'other';
}

/** Splits one CSV line, honoring quoted fields with commas and doubled quotes. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const num = (s: string) => {
  const t = s.replace(/[$,\s]/g, '');
  const neg = /^\(.*\)$/.test(t);
  const v = Number(t.replace(/[()]/g, ''));
  return Number.isFinite(v) ? (neg ? -v : v) : NaN;
};

/** A date in ISO form (YYYY-MM-DD) from the forms statements use: 2026-11-03, 11/03/2026, 11/3/26, 20261103. */
export function isoDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  m = t.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}

/** Transactions of a CSV export: the header row names the date, description, and amount columns (or debit and credit).
 * Spending is negative. A card export listing purchases as positive amounts is flipped when most rows are positive and a
 * "payment" row is negative, as card issuers export them. */
export function parseCsv(text: string, source: string): Txn[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hi = lines.findIndex((l) => /date/i.test(l) && /(amount|debit|credit)/i.test(l));
  if (hi < 0) return [];
  const head = cells(lines[hi]).map((h) => h.toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const cDate = col(/^(transaction |posted |post )?date/), cDesc = col(/desc|payee|merchant|name|memo|details/);
  const cAmt = col(/^amount/), cDebit = col(/debit|withdraw/), cCredit = col(/credit|deposit/);
  const rows: Txn[] = [];
  for (const line of lines.slice(hi + 1)) {
    const c = cells(line);
    const date = isoDate(c[cDate] ?? '');
    if (!date) continue;
    let amount = cAmt >= 0 ? num(c[cAmt] ?? '') : (num(c[cCredit] ?? '') || 0) - (num(c[cDebit] ?? '') || 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const description = (c[cDesc] ?? '').replace(/\s+/g, ' ');
    rows.push({ id: '', date, description, amount, category: 'other', source });
  }
  const pos = rows.filter((r) => r.amount > 0).length;
  const payNeg = rows.some((r) => r.amount < 0 && /payment/i.test(r.description));
  if (cAmt >= 0 && pos > rows.length * 0.7 && payNeg) for (const r of rows) r.amount = -r.amount;
  for (const r of rows) { r.category = categorize(r.description, r.amount); r.id = key(r); }
  return rows;
}

/** Transactions of an OFX or QFX export (the format banks name Quicken or Money downloads). */
export function parseOfx(text: string, source: string): Txn[] {
  const rows: Txn[] = [];
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const tag = (t: string) => block.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i'))?.[1]?.trim() ?? '';
    const date = isoDate(tag('DTPOSTED'));
    const amount = num(tag('TRNAMT'));
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    const description = [tag('NAME'), tag('MEMO')].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const r: Txn = { id: '', date, description, amount, category: categorize(description, amount), source };
    r.id = tag('FITID') ? source + ':' + tag('FITID') : key(r);
    rows.push(r);
  }
  return rows;
}

/** Transactions of a PDF statement's text lines: a line starting with a date (MM/DD or MM/DD/YY[YY]) and ending with an
 * amount, a running balance after it dropped. The year comes from the date or the statement's first 20xx. Spending is
 * negative: a statement listing most rows as positive (a card's purchases) is flipped. */
export function parsePdfLines(lines: string[], source: string): Txn[] {
  const year = (lines.join(' ').match(/\b20\d{2}\b/) ?? [String(new Date().getFullYear())])[0];
  const money = String.raw`\(?-?\$?[\d,]+\.\d{2}\)?-?`;
  const re = new RegExp(String.raw`^(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\s+(.+?)\s+(${money})(?:\s+${money})?$`);
  const num = (s: string) => (/^\(|-$|^-|^\(?-/.test(s) ? -1 : 1) * Number(s.replace(/[()$,\-]/g, ''));
  const rows: Txn[] = [];
  for (const raw of lines) {
    const m = raw.trim().replace(/\s+/g, ' ').match(re);
    if (!m) continue;
    const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : year;
    const date = `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const amount = num(m[5]);
    if (!isFinite(amount) || amount === 0) continue;
    rows.push({ id: '', date, description: m[4], amount, category: 'other', source });
  }
  const flip = rows.filter((r) => r.amount > 0).length > rows.length / 2 ? -1 : 1;
  return rows.map((r, i) => {
    const amount = r.amount * flip;
    return { ...r, amount, id: source + ':' + i, category: categorize(r.description, amount) };
  });
}

const key = (r: Txn) => r.date + '|' + r.amount.toFixed(2) + '|' + r.description.toLowerCase().slice(0, 40);

/** Parses a file by its name and contents; unknown kinds give no transactions. */
export function parseStatement(name: string, text: string): Txn[] {
  if (/\.(ofx|qfx)$/i.test(name) || /<OFX>/i.test(text)) return parseOfx(text, name);
  if (/\.csv$/i.test(name) || text.includes(',')) return parseCsv(text, name);
  return [];
}

/** The log with new transactions merged in, a transaction already held (same date, amount, and description) kept once. */
export function mergeLog(log: Txn[], add: Txn[]): Txn[] {
  const seen = new Set(log.map(key));
  return [...log, ...add.filter((t) => !seen.has(key(t)) && seen.add(key(t)))].sort((a, b) => b.date.localeCompare(a.date));
}

/** Spending (positive dollars) by month and category, transfers and income left out. */
export function spendingByMonth(log: Txn[]): Record<string, Partial<Record<string, number>>> {
  const out: Record<string, Partial<Record<string, number>>> = {};
  for (const t of log) {
    if (t.amount >= 0 || t.category === 'transfer' || t.category === 'income') continue;
    const m = t.date.slice(0, 7);
    out[m] ??= {};
    out[m][t.category] = (out[m][t.category] ?? 0) - t.amount;
  }
  return out;
}
