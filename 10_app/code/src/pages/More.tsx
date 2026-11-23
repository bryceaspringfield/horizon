// The estate, optimizer, plot builder, and single-year tax pages.
import { useMemo, useState } from 'react';
import { netLegacy } from '../engine/estate';
import { optimize, type Candidate } from '../engine/optimize';
import { rulesFor } from '../engine/tax';
import { useActivePlan, useStore } from '../store';
import { useProjection } from '../useProjection';
import { Card, Chart, Num, Select, Stat, money, moneyAxis, moneyTooltip, pct } from '../ui';

export function EstatePage() {
  const { plan, proj } = useProjection();
  const update = useStore((s) => s.update);
  const raw = useActivePlan();
  const l = netLegacy(plan, proj);
  const e = raw.estate ?? { heirsTaxRate: 0.24, exemption: 15000000 };
  const yrs = proj.years.map((y) => String(y.year));
  return (
    <>
      <div className="stats">
        <Stat icon="coins" label={`Estate in ${l.year}`} value={money(l.grossEstate, true)} sub="future dollars" />
        <Stat icon="taxes" label="Federal estate tax" value={money(l.estateTax, true)} sub="40% above the exemption" />
        <Stat icon="taxes" label="Heirs' income tax" value={money(l.heirsIncomeTax, true)} sub="on inherited traditional accounts and HSAs" />
        <Stat icon="flag" label="Net legacy" value={money(l.netLegacy, true)} sub={`${money(l.netLegacyReal, true)} in today's dollars`} tone="good" />
      </div>
      <Card title="Estate assumptions">
        <div className="grid">
          <Num label="Heirs' income tax rate" percent value={e.heirsTaxRate} onChange={(v) => update((p) => { p.estate = { ...e, heirsTaxRate: v }; })} />
        </div>
        <p className="muted">The federal estate tax exemption is $15,000,000 a person in 2026 and $15,480,000 in 2027 (IRS), indexed by inflation after; a married couple gets two through portability. State estate and inheritance taxes are not modeled. Heirs must empty an inherited traditional IRA within ten years and pay income tax on it; taxable accounts and real estate pass with a stepped-up basis and Roth accounts pass tax-free.</p>
      </Card>
      <Card title="Estate tax if the estate passed in each year (future dollars)">
        <Chart height={280} option={{ tooltip: moneyTooltip, grid: { left: 70, right: 16, top: 20, bottom: 30 },
          xAxis: { type: 'category', data: yrs }, yAxis: moneyAxis,
          series: [{ type: 'bar', name: 'Estate tax', data: proj.years.map((y) => Math.round(y.taxes.estate ?? 0)) }] }} />
      </Card>
    </>
  );
}

export function OptimizePage() {
  const raw = useActivePlan();
  const update = useStore((s) => s.update);
  const [target, setTarget] = useState<'legacy' | 'taxes'>('legacy');
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); setTimeout(() => { setResults(optimize(raw, target)); setBusy(false); }, 20); };
  return (
    <>
      <Card title="Strategy optimizer" actions={<button onClick={run} disabled={busy}>{busy ? 'Searching 60 strategies…' : 'Search'}</button>}>
        <div className="grid">
          <Select label="Find the strategy with" value={target} options={[['legacy', 'The largest net legacy'], ['taxes', 'The lowest lifetime taxes']]} onChange={setTarget} />
        </div>
        <p className="muted">Tries 60 combinations of Roth conversions (none, or up to the 12%, 22%, 24%, or 32% bracket), withdrawal order or proportional withdrawals, a withdrawal shield (none, under 22%, under the first IRMAA tier), and realizing gains in the 0% band. Strategies in which the money runs out rank last.</p>
      </Card>
      {results && <Card title="Best strategies">
        <div className="scroll">
          <table className="num">
            <thead><tr><th>Strategy</th><th>Net legacy (today's $)</th><th>Lifetime taxes (today's $)</th><th>Lasts</th><th></th></tr></thead>
            <tbody>{results.slice(0, 15).map((c, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'normal', textAlign: 'left' }}>{i === 0 ? '★ ' : ''}{c.label}</td>
                <td>{money(c.netLegacyReal, true)}</td><td>{money(c.lifetimeTaxReal, true)}</td><td>{c.lasts ? 'Yes' : 'No'}</td>
                <td><button className="ghost" onClick={() => update((p) => { Object.assign(p.strategy, c.changes); if (c.changes.rothConversionBracket && !p.strategy.rothConversionStart) p.strategy.rothConversionStart = p.startYear; })}>Apply</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>}
    </>
  );
}

type Metric = { key: string; label: string; get: (y: ReturnType<typeof useProjection>['proj']['years'][0]) => number };

export function PlotPage() {
  const { plan, proj, adj, real } = useProjection();
  const metrics: Metric[] = useMemo(() => [
    { key: 'nw', label: 'Net worth', get: (y) => y.netWorth },
    { key: 'liq', label: 'Investments', get: (y) => y.liquidNetWorth },
    { key: 'inc', label: 'Income', get: (y) => Object.values(y.income).reduce((t, v) => t + v, 0) },
    { key: 'ss', label: 'Social Security', get: (y) => y.socialSecurity },
    { key: 'sp', label: 'Spending', get: (y) => y.totalExpenses },
    { key: 'tax', label: 'Total taxes', get: (y) => y.taxes.total },
    { key: 'fed', label: 'Federal income tax', get: (y) => y.taxes.federal },
    { key: 'st', label: 'State tax', get: (y) => y.taxes.state },
    { key: 'ti', label: 'Taxable income', get: (y) => y.taxes.taxableIncome },
    { key: 'wd', label: 'Withdrawals', get: (y) => Object.values(y.withdrawals).reduce((t, v) => t + v, 0) },
    { key: 'rc', label: 'Roth conversions', get: (y) => y.rothConversion },
    { key: 'rmd', label: 'Required distributions', get: (y) => y.rmd },
    { key: 'ret', label: 'Investment returns', get: (y) => y.investmentReturn },
    { key: 'med', label: 'Medicare premiums', get: (y) => y.taxes.medicare },
    ...plan.accounts.map((a) => ({ key: 'a_' + a.id, label: a.name, get: (y: (typeof proj.years)[0]) => y.balances[a.id] ?? 0 })),
  ], [plan, proj]);
  const [chosen, setChosen] = useState<string[]>(['nw', 'tax']);
  const [type, setType] = useState<'line' | 'bar' | 'area'>('line');
  return (
    <>
      <Card title="Plot builder">
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {metrics.map((m) => (
            <span key={m.key} className={'pill' + (chosen.includes(m.key) ? ' on' : '')} style={{ boxShadow: 'none' }}
              onClick={() => setChosen(chosen.includes(m.key) ? chosen.filter((x) => x !== m.key) : [...chosen, m.key])}>{m.label}</span>
          ))}
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          <Select label="Chart" value={type} options={[['line', 'Lines'], ['area', 'Stacked areas'], ['bar', 'Stacked bars']]} onChange={setType} />
        </div>
      </Card>
      <Card title={`Your chart (${real ? "today's" : 'future'} dollars)`}>
        <Chart height={420} option={{ tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 16, top: 40, bottom: 30 },
          xAxis: { type: 'category', boundaryGap: type === 'bar', data: proj.years.map((y) => String(y.year)) }, yAxis: moneyAxis,
          series: metrics.filter((m) => chosen.includes(m.key)).map((m) => ({ name: m.label, type: type === 'bar' ? 'bar' : 'line', smooth: true, symbol: 'none',
            stack: type === 'line' ? undefined : 'all', areaStyle: type === 'area' ? { opacity: 0.5 } : undefined,
            data: proj.years.map((y, i) => Math.round(adj(m.get(y), i))) })) }} />
      </Card>
    </>
  );
}

export function TaxYear() {
  const { plan, proj } = useProjection();
  const [year, setYear] = useState(plan.startYear);
  const i = Math.max(0, proj.years.findIndex((y) => y.year === year));
  const y = proj.years[i];
  const t = y.taxes;
  const status = plan.people.length === 2 && plan.assumptions.filingStatus === 'mfj' ? 'mfj' : plan.assumptions.filingStatus === 'hoh' ? 'hoh' : 'single';
  const r = rulesFor(year);
  const k = Math.pow(1 + plan.assumptions.inflation, year - r.year < 0 ? 0 : year - Math.max(r.year, plan.startYear)) * (r.year < plan.startYear ? Math.pow(1 + plan.assumptions.inflation, plan.startYear - r.year) : 1);
  const brackets = r.rules.brackets[status].map(([lo, rate]: number[]) => [lo * k, rate]);
  const ordinary = t.ordinaryTaxable ?? t.taxableIncome;
  const fills = brackets.map(([lo, rate]: number[], j: number) => {
    const hi = j + 1 < brackets.length ? brackets[j + 1][0] : Infinity;
    return { rate, used: Math.max(0, Math.min(ordinary, hi) - lo), size: hi === Infinity ? Math.max(0, ordinary - lo) : hi - lo };
  }).filter((f: { used: number; size: number }, j: number) => j < 5 || f.used > 0);
  return (
    <Card title={`Tax year ${year}`} actions={<input type="range" min={plan.startYear} max={proj.years[proj.years.length - 1].year} value={year} onChange={(e) => setYear(Number(e.target.value))} />}>
      <div className="stats">
        <Stat label="Taxable income" value={money(t.taxableIncome, true)} sub={t.itemized ? `itemized ${money(t.deduction, true)}` : `standard deduction ${money(t.deduction, true)}`} />
        <Stat label="Federal income tax" value={money(t.federal + t.capitalGains, true)} sub={`marginal ${pct(t.marginalRate, 0)}`} />
        <Stat label="State tax" value={money(t.state, true)} />
        <Stat label="Effective rate" value={pct(t.effectiveRate)} sub="all taxes over gross income" />
      </div>
      <div className="muted" style={{ marginBottom: 8 }}>How ordinary taxable income fills each federal bracket (future dollars; gains and qualified dividends sit in their own bands)</div>
      {fills.map((f: { rate: number; used: number; size: number }) => (
        <div key={f.rate} className="row" style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
          <span style={{ width: 44, fontWeight: 600 }}>{pct(f.rate, 0)}</span>
          <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ width: `${f.size > 0 ? Math.min(100, (f.used / f.size) * 100) : 0}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
          </div>
          <span className="muted" style={{ width: 170, textAlign: 'right' }}>{money(f.used, true)} of {f.size > 0 && isFinite(f.size) ? money(f.size, true) : '∞'}</span>
        </div>
      ))}
    </Card>
  );
}
