import { describe, expect, it } from 'vitest';
import { parsePdfLines } from '../statements';

describe('PDF statements', () => {
  it('reads dated lines with an amount and a running balance', () => {
    const lines = ['Statement period 10/01/2026 to 10/31/2026', '10/03 WHOLE FOODS MKT #123 -84.12 1,915.88', '10/05 PAYROLL DIRECT DEP 2,500.00 4,415.88', 'Page 1 of 2'];
    const t = parsePdfLines(lines, 'bank.pdf');
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ date: '2026-10-03', amount: -84.12, category: 'groceries' });
    expect(t[1]).toMatchObject({ amount: 2500, category: 'income' });
  });
  it('flips a card statement listing purchases as positive', () => {
    const t = parsePdfLines(['11/02/26 STARBUCKS 5.75', '11/04/26 SHELL OIL 40.00', '11/09/26 PAYMENT THANK YOU (500.00)'], 'card.pdf');
    expect(t.map((x) => x.amount)).toEqual([-5.75, -40, 500]);
  });
});
