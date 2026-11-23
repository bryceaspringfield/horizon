import { describe, expect, it } from 'vitest';
import { history, rangeStart } from '../history';
import type { Account } from '../types';

const acc = (id: string, kind: Account['kind']) => ({ id, name: id, kind, ownerId: 'p', balance: 0 }) as Account;
const accounts = [acc('c', 'cash'), acc('r', 'roth'), acc('h', 'asset'), acc('m', 'debt')];

describe('net worth history', () => {
  it('counts back each range from the latest date', () => {
    expect(rangeStart('3M', '2026-05-15')).toBe('2026-02-15');
    expect(rangeStart('YTD', '2026-05-15')).toBe('2026-01-01');
  });
  it('sums net worth, liquid net worth, and the change over a range', () => {
    const snaps = [
      { date: '2025-01-01', balances: { c: 10, r: 100, h: 300, m: -200 } },
      { date: '2026-03-01', balances: { c: 20, r: 130, h: 300, m: -190 } },
    ];
    const all = history(snaps, accounts, 'All');
    expect(all.points[1].netWorth).toBe(260);
    expect(all.points[1].investable).toBe(130);
    expect(all.points[1].liquidNetWorth).toBe(150 - 190);
    expect(all.change).toBe(50);
    expect(history(snaps, accounts, '1Y').points).toHaveLength(1);
  });
});
