import { describe, expect, it } from 'vitest';
import { mergeLog, parseCsv, parseOfx, spendingByMonth } from '../statements';

// Statement upload (Bryce, 2026-11-23): CSV and OFX exports into a categorized, deduplicated spending log.
describe('statements', () => {
  it('reads a bank CSV with debit and credit columns', () => {
    const csv = 'Posted Date,Description,Debit,Credit\n11/03/2026,"TRADER JOE\'S #512, BOSTON",54.20,\n11/04/2026,PAYROLL ACME,,2500.00\n11/05/2026,STARBUCKS,6.10,\n';
    const t = parseCsv(csv, 'bank.csv');
    expect(t).toHaveLength(3);
    expect(t[0]).toMatchObject({ date: '2026-11-03', amount: -54.2, category: 'groceries' });
    expect(t[1]).toMatchObject({ amount: 2500, category: 'income' });
    expect(t[2].category).toBe('dining');
  });
  it('flips a card CSV listing purchases as positive amounts', () => {
    const csv = 'Transaction Date,Description,Amount\n2026-11-01,NETFLIX.COM,15.49\n2026-11-02,SHELL OIL 123,40.00\n2026-11-03,AMAZON MKTPL,22.00\n2026-11-10,PAYMENT THANK YOU,-77.49\n';
    const t = parseCsv(csv, 'card.csv');
    expect(t[0]).toMatchObject({ amount: -15.49, category: 'streaming' });
    expect(t[1].category).toBe('gas');
    expect(t[3].category).toBe('transfer');
  });
  it('reads OFX and drops duplicates on merge', () => {
    const ofx = '<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107120000<TRNAMT>-12.00<FITID>a1<NAME>SPOTIFY</STMTTRN></OFX>';
    const a = parseOfx(ofx, 'x.qfx');
    expect(a[0]).toMatchObject({ date: '2026-11-07', amount: -12, category: 'streaming' });
    const log = mergeLog(a, a);
    expect(log).toHaveLength(1);
    expect(spendingByMonth(log)['2026-11'].streaming).toBeCloseTo(12, 6);
  });
});
