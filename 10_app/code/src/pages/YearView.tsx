// A year at a glance (ProjectionLab's home view, 2026-11-23): a slider picks a year; net worth and investable assets that
// year, each split by kind of account, the household with each person's age, and the milestones ahead with how far off.
import { useState } from 'react';
import type { Account } from '../engine/types';
import { useProjection } from '../useProjection';
import { money } from '../ui';

const GROUPS: [string, string, (a: Account) => boolean][] = [
  ['taxFree', 'Tax-free', (a) => a.kind === 'roth' || a.kind === 'hsa' || a.kind === 'college529'],
  ['taxDeferred', 'Tax-deferred', (a) => a.kind === 'traditional'],
  ['taxable', 'Taxable investments', (a) => a.kind === 'taxable'],
  ['cash', 'Cash', (a) => a.kind === 'cash'],
  ['realAsset', 'Real asset equity', (a) => a.kind === 'asset'],
  ['debt', 'Debt', (a) => a.kind === 'debt'],
];
const COLORS: Record<string, string> = { taxFree: '#0ea5e9', taxDeferred: '#6366f1', taxable: '#06b6d4', cash: '#14b8a6', realAsset: '#a855f7', debt: '#f97316' };

export function YearView() {
  const { plan, proj } = useProjection();
  const [i, setI] = useState(0);
  const y = proj.years[Math.min(i, proj.years.length - 1)];
  if (!y) return null;
  const parts = GROUPS.map(([k, label, f]) => ({ k, label, v: plan.accounts.filter(f).reduce((t, a) => t + (y.balances[a.id] ?? 0), 0) }));
  const pos = parts.filter((p) => p.v > 0.5 && p.k !== 'debt');
  const total = pos.reduce((t, p) => t + p.v, 0);
  const invest = pos.filter((p) => p.k !== 'realAsset');
  const investTotal = invest.reduce((t, p) => t + p.v, 0);
  const ahead = proj.years.flatMap((r) => r.milestonesReached.map((id) => ({ year: r.year, m: plan.milestones.find((x) => x.id === id) })))
    .filter((e) => e.m && e.year >= y.year).slice(0, 4);
  const bar = (list: typeof pos, sum: number) => (
    <>
      <div className="budgetbar">{list.map((p) => <span key={p.k} style={{ flex: p.v, background: COLORS[p.k] }} />)}</div>
      <div className="legend">{list.map((p) => <span key={p.k}><i style={{ background: COLORS[p.k] }} />{p.label} {sum ? Math.round((p.v / sum) * 100) : 0}%</span>)}</div>
    </>
  );
  return (
    <section className="card yearview">
      <div className="yvtop">
        <div><span className="muted">Net worth in </span><b>{y.year}</b></div>
        <input type="range" min={0} max={proj.years.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} aria-label="Year" />
      </div>
      <div className="yvcols">
        <div><small className="muted">Net worth</small><h2>{money(y.netWorth)}</h2>{bar(pos, total)}</div>
        <div><small className="muted">Investable assets</small><h2>{money(investTotal)}</h2>{bar(invest, investTotal)}</div>
        <div><small className="muted">Household</small>
          <ul className="people">{plan.people.map((p) => <li key={p.id}><b>{p.name || 'You'}</b><small>age {y.year - p.birthYear}</small></li>)}</ul>
        </div>
      </div>
      {!!ahead.length && <ul className="lifelist yvahead">{ahead.map((e, k) => <li key={k} className="milestone"><b>{e.m!.name}</b><small>{e.year === y.year ? 'this year' : 'in ' + (e.year - y.year) + ' years'} · {e.year}</small></li>)}</ul>}
    </section>
  );
}
