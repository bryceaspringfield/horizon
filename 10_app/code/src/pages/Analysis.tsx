// The pages reading the projection: the dashboard, net worth and cash-flow charts, taxes, Monte Carlo, plan
// comparison, progress against the plan, and the year-by-year table.
import { useMemo, useState } from 'react';
import type { AccountKind, Plan } from '../engine/types';
import { runMonteCarlo, type MonteCarloResult } from '../engine/montecarlo';
import { useStore, type Snapshot } from '../store';
import { projectPlan, useProjection } from '../useProjection';
import { Card, Chart, Num, Select, Stat, money, moneyAxis, moneyTooltip, pct } from '../ui';
import { uid } from '../engine/defaults';

const KIND_LABEL: Record<AccountKind, string> = {
  cash: 'Cash', taxable: 'Taxable', traditional: 'Traditional', roth: 'Roth', hsa: 'HSA', college529: '529', asset: 'Assets', debt: 'Debts',
};

function dollarsNote(real: boolean) {
  return real ? "today's dollars" : 'future (nominal) dollars';
}

function milestoneMarks(plan: Plan, years: { year: number; milestonesReached: string[] }[]) {
  return years.flatMap((y) => y.milestonesReached.map((id) => ({
    xAxis: String(y.year),
    label: { formatter: plan.milestones.find((m) => m.id === id)?.name ?? '', position: 'insideEndTop', fontSize: 10 },
  })));
}

export function Dashboard() {
  const { plan, proj, adj, real } = useProjection();
  const first = proj.years[0];
  const retireYear = Math.min(...plan.people.map((p) => p.birthYear + (plan.strategy.retirementAge[p.id] ?? 200)));
  const ri = proj.years.findIndex((y) => y.year === retireYear);
  const atRet = proj.years[ri] ?? first;
  const peak = proj.years.reduce((m, y, i) => Math.max(m, adj(y.liquidNetWorth, i)), 0);
  const lifeTax = proj.years.reduce((t, y, i) => t + adj(y.taxes.total, i), 0);
  return (
    <>
      <div className="stats">
        <Stat label="Net worth today" value={money(first.netWorth)} />
        <Stat label="Financial independence" value={proj.financialIndependenceYear ?? 'Not reached'} sub={proj.financialIndependenceYear ? `age ${proj.financialIndependenceYear - plan.people[0].birthYear}` : undefined} tone={proj.financialIndependenceYear ? 'good' : 'bad'} />
        <Stat label={`Investments at retirement (${retireYear})`} value={money(adj(atRet.liquidNetWorth, Math.max(0, ri)), true)} />
        <Stat label="Money lasts" value={proj.depletionYear ? `Runs out in ${proj.depletionYear}` : 'For life'} tone={proj.depletionYear ? 'bad' : 'good'} />
        <Stat label="Peak investments" value={money(peak, true)} />
        <Stat label="Lifetime taxes" value={money(lifeTax, true)} />
      </div>
      <NetWorthChart />
      <Card title="Income and spending" wide>
        <IncomeSpendingChart />
      </Card>
      <p className="muted">All amounts in {dollarsNote(real)}; switch in Settings.</p>
    </>
  );
}

export function NetWorthChart() {
  const { plan, proj, adj, real } = useProjection();
  const kinds: AccountKind[] = ['cash', 'taxable', 'traditional', 'roth', 'hsa', 'college529', 'asset', 'debt'];
  const series = kinds
    .map((k) => ({
      name: KIND_LABEL[k],
      type: 'bar',
      stack: 'nw',
      data: proj.years.map((y, i) => Math.round(adj(plan.accounts.filter((a) => a.kind === k).reduce((t, a) => t + (y.balances[a.id] ?? 0), 0), i))),
    }))
    .filter((s) => s.data.some((v) => v !== 0));
  series.push({ name: 'Net worth', type: 'line', data: proj.years.map((y, i) => Math.round(adj(y.netWorth, i))), stack: undefined as unknown as string,
    ...({ markLine: { symbol: 'none', lineStyle: { type: 'dashed', color: '#888' }, data: milestoneMarks(plan, proj.years) } } as object) });
  return (
    <Card title={`Net worth by account type (${dollarsNote(real)})`} wide>
      <Chart height={420} option={{
        tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 50 },
        xAxis: { type: 'category', data: proj.years.map((y) => String(y.year)) }, yAxis: moneyAxis,
        dataZoom: [{ type: 'slider', height: 18, bottom: 8 }], series,
      }} />
    </Card>
  );
}

function IncomeSpendingChart() {
  const { proj, adj } = useProjection();
  const yrs = proj.years.map((y) => String(y.year));
  const inc = (f: (y: (typeof proj.years)[0]) => number) => proj.years.map((y, i) => Math.round(adj(f(y), i)));
  return (
    <Chart option={{
      tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: yrs }, yAxis: moneyAxis,
      series: [
        { name: 'Work and other income', type: 'bar', stack: 'in', data: inc((y) => Object.values(y.income).reduce((t, v) => t + v, 0)) },
        { name: 'Social Security', type: 'bar', stack: 'in', data: inc((y) => y.socialSecurity) },
        { name: 'Withdrawals', type: 'bar', stack: 'in', data: inc((y) => Object.values(y.withdrawals).reduce((t, v) => t + v, 0)) },
        { name: 'Spending', type: 'line', data: inc((y) => y.totalExpenses) },
        { name: 'Taxes', type: 'line', data: inc((y) => y.taxes.total) },
      ],
    }} />
  );
}

export function CashFlowPage() {
  const { plan, proj, adj, real } = useProjection();
  const [year, setYear] = useState(plan.startYear);
  const i = Math.max(0, proj.years.findIndex((y) => y.year === year));
  const y = proj.years[i];
  const name = (id: string) =>
    plan.incomes.find((x) => x.id === id)?.name ?? plan.expenses.find((x) => x.id === id)?.name ?? plan.accounts.find((x) => x.id === id)?.name ?? (id === '__spending' ? 'Retirement spending' : id);
  const links: { source: string; target: string; value: number }[] = [];
  const add = (source: string, target: string, v: number) => { if (v > 1) links.push({ source, target, value: Math.round(adj(v, i)) }); };
  for (const [id, v] of Object.entries(y.income)) add(name(id), 'Cash flow', v);
  add('Social Security', 'Cash flow', y.socialSecurity);
  add('Employer match', 'Cash flow', y.employerMatch);
  for (const [id, v] of Object.entries(y.withdrawals)) add(name(id) + ' (withdrawal)', 'Cash flow', v);
  add('Cash flow', 'Federal tax', y.taxes.federal + y.taxes.capitalGains + y.taxes.niit + y.taxes.penalty);
  add('Cash flow', 'State tax', y.taxes.state);
  add('Cash flow', 'Payroll tax', y.taxes.fica);
  for (const [id, v] of Object.entries(y.expenses)) add('Cash flow', name(id), v);
  for (const [id, v] of Object.entries(y.contributions)) add('Cash flow', name(id) + ' (saved)', v);
  const nodes = [...new Set(links.flatMap((l) => [l.source, l.target]))].map((n) => ({ name: n }));
  return (
    <Card title={`Where the money goes in ${year} (${dollarsNote(real)})`} wide actions={
      <input type="range" min={plan.startYear} max={proj.years[proj.years.length - 1].year} value={year} onChange={(e) => setYear(Number(e.target.value))} />
    }>
      <div className="stats">
        <Stat label="Year" value={year} sub={plan.people.map((p) => `${p.name} ${y.ages[p.id]}`).join(', ')} />
        <Stat label="Spending" value={money(adj(y.totalExpenses, i))} />
        <Stat label="Taxes" value={money(adj(y.taxes.total, i))} sub={`${pct(y.taxes.effectiveRate)} effective`} />
        <Stat label="Saved" value={money(adj(Object.values(y.contributions).reduce((t, v) => t + v, 0), i))} />
      </div>
      <Chart height={520} option={{
        tooltip: { trigger: 'item', valueFormatter: (v: number) => money(v) },
        series: [{ type: 'sankey', data: nodes, links, nodeGap: 10, emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', curveness: 0.5 }, label: { fontSize: 11 } }],
      }} />
    </Card>
  );
}

export function TaxesPage() {
  const { proj, adj, real } = useProjection();
  const yrs = proj.years.map((y) => String(y.year));
  const s = (f: (t: (typeof proj.years)[0]['taxes']) => number) => proj.years.map((y, i) => Math.round(adj(f(y.taxes), i)));
  return (
    <>
      <Card title={`Taxes by year (${dollarsNote(real)})`} wide>
        <Chart option={{
          tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: yrs }, yAxis: moneyAxis,
          series: [
            { name: 'Federal income', type: 'bar', stack: 't', data: s((t) => t.federal) },
            { name: 'Capital gains', type: 'bar', stack: 't', data: s((t) => t.capitalGains) },
            { name: 'NIIT', type: 'bar', stack: 't', data: s((t) => t.niit) },
            { name: 'State', type: 'bar', stack: 't', data: s((t) => t.state) },
            { name: 'Payroll (FICA)', type: 'bar', stack: 't', data: s((t) => t.fica) },
            { name: 'Early withdrawal penalty', type: 'bar', stack: 't', data: s((t) => t.penalty) },
          ],
        }} />
      </Card>
      <Card title="Tax rates" wide>
        <Chart height={300} option={{
          tooltip: { trigger: 'axis', valueFormatter: (v: number) => pct(v) }, legend: { top: 0 }, grid: { left: 60, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: yrs }, yAxis: { type: 'value', axisLabel: { formatter: (v: number) => pct(v, 0) } },
          series: [
            { name: 'Marginal federal bracket', type: 'line', step: 'end', data: proj.years.map((y) => y.taxes.marginalRate) },
            { name: 'Effective rate (all taxes)', type: 'line', data: proj.years.map((y) => +y.taxes.effectiveRate.toFixed(4)) },
          ],
        }} />
      </Card>
      <Card title="Roth conversions and required distributions" wide>
        <Chart height={300} option={{
          tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: yrs }, yAxis: moneyAxis,
          series: [
            { name: 'Roth conversion', type: 'bar', data: proj.years.map((y, i) => Math.round(adj(y.rothConversion, i))) },
            { name: 'Required minimum distribution', type: 'bar', data: proj.years.map((y, i) => Math.round(adj(y.rmd, i))) },
          ],
        }} />
      </Card>
    </>
  );
}

export function MonteCarloPage() {
  const plan = useProjection().plan;
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      setResult(runMonteCarlo(plan, settings.mcMethod, settings.mcTrials));
      setBusy(false);
    }, 20);
  };
  return (
    <>
      <Card title="Monte Carlo simulation" actions={<button onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run'}</button>}>
        <div className="grid">
          <Select label="Returns" value={settings.mcMethod} options={[['normal', 'Random, from your assumptions'], ['historicalBlocks', 'Random 5-year blocks of 1928–2025'], ['backtest', 'Every historical start year']]}
            onChange={(v) => setSettings({ mcMethod: v })} />
          {settings.mcMethod !== 'backtest' && <Num label="Trials" value={settings.mcTrials} onChange={(v) => setSettings({ mcTrials: Math.max(50, Math.min(10000, v)) })} />}
        </div>
      </Card>
      {result && <>
        <div className="stats">
          <Stat label="Chance of success" value={pct(result.successRate, 0)} sub={`${result.trials} ${result.method === 'backtest' ? 'start years' : 'trials'}`} tone={result.successRate >= 0.85 ? 'good' : 'bad'} />
          <Stat label="Ending, median (today's $)" value={money(result.endingReal.p50, true)} />
          <Stat label="Ending, bad case (10th pct.)" value={money(result.endingReal.p10, true)} />
          <Stat label="Ending, good case (90th pct.)" value={money(result.endingReal.p90, true)} />
        </div>
        <Card title="Investments across trials (today's dollars)" wide>
          <Chart height={400} option={{
            tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
            xAxis: { type: 'category', data: result.bands.map((b) => String(b.year)) }, yAxis: moneyAxis,
            series: [
              { name: '10th', type: 'line', stack: 'b', symbol: 'none', lineStyle: { opacity: 0 }, data: result.bands.map((b) => Math.round(b.p10)) },
              { name: '10th–90th', type: 'line', stack: 'b', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { opacity: 0.15 }, data: result.bands.map((b) => Math.round(b.p90 - b.p10)) },
              { name: '25th', type: 'line', symbol: 'none', lineStyle: { type: 'dashed' }, data: result.bands.map((b) => Math.round(b.p25)) },
              { name: 'Median', type: 'line', symbol: 'none', lineStyle: { width: 3 }, data: result.bands.map((b) => Math.round(b.p50)) },
              { name: '75th', type: 'line', symbol: 'none', lineStyle: { type: 'dashed' }, data: result.bands.map((b) => Math.round(b.p75)) },
            ],
          }} />
        </Card>
        <Card title="Share of trials with money left" wide>
          <Chart height={260} option={{
            tooltip: { trigger: 'axis', valueFormatter: (v: number) => pct(v, 0) }, grid: { left: 60, right: 20, top: 20, bottom: 30 },
            xAxis: { type: 'category', data: result.survival.map((s) => String(s.year)) }, yAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v: number) => pct(v, 0) } },
            series: [{ type: 'line', areaStyle: { opacity: 0.2 }, data: result.survival.map((s) => s.share) }],
          }} />
        </Card>
        {result.starts && <Card title="Outcome by historical start year (today's dollars at the end)" wide>
          <Chart height={300} option={{
            tooltip: moneyTooltip, grid: { left: 70, right: 20, top: 20, bottom: 30 },
            xAxis: { type: 'category', data: result.starts.map((s) => String(s.start)) }, yAxis: moneyAxis,
            series: [{ type: 'bar', data: result.starts.map((s) => ({ value: Math.round(s.endingReal), itemStyle: { color: s.success ? '#10b981' : '#ef4444' } })) }],
          }} />
        </Card>}
      </>}
      {!result && <p className="muted">Runs the plan through many return paths and reports how often the money lasts. Red bars in a backtest mark start years in which it ran out.</p>}
    </>
  );
}

export function ComparePage() {
  const plans = useStore((s) => s.plans);
  const compareIds = useStore((s) => s.compareIds);
  const setCompare = useStore((s) => s.setCompare);
  const real = useStore((s) => s.settings.realDollars);
  const chosen = plans.filter((p) => compareIds.includes(p.id));
  const runs = useMemo(() => chosen.map((p) => ({ plan: p, ...projectPlan(p) })), [chosen]);
  const years = [...new Set(runs.flatMap((r) => r.proj.years.map((y) => y.year)))].sort();
  return (
    <>
      <Card title="Plans to compare">
        {plans.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={compareIds.includes(p.id)} onChange={(e) => setCompare(e.target.checked ? [...compareIds, p.id] : compareIds.filter((x) => x !== p.id))} />
            {p.name}
          </label>
        ))}
        <p className="muted">Make a copy of a plan in the plan menu, change one thing (retirement age, spending, a Roth conversion bracket), and compare.</p>
      </Card>
      {runs.length > 0 && <>
        <Card title={`Net worth (${dollarsNote(real)})`} wide>
          <Chart option={{
            tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
            xAxis: { type: 'category', data: years.map(String) }, yAxis: moneyAxis,
            series: runs.map((r) => ({ name: r.plan.name, type: 'line', symbol: 'none', data: years.map((y) => {
              const i = r.proj.years.findIndex((x) => x.year === y);
              return i < 0 ? null : Math.round(real ? r.proj.years[i].netWorth / r.d[i] : r.proj.years[i].netWorth);
            }) })),
          }} />
        </Card>
        <Card title="Side by side" wide>
          <table>
            <thead><tr><th></th>{runs.map((r) => <th key={r.plan.id}>{r.plan.name}</th>)}</tr></thead>
            <tbody>
              <tr><td>Financial independence</td>{runs.map((r) => <td key={r.plan.id}>{r.proj.financialIndependenceYear ?? '—'}</td>)}</tr>
              <tr><td>Money runs out</td>{runs.map((r) => <td key={r.plan.id}>{r.proj.depletionYear ?? 'Never'}</td>)}</tr>
              <tr><td>Ending net worth (today's $)</td>{runs.map((r) => <td key={r.plan.id}>{money(r.proj.endingNetWorthReal)}</td>)}</tr>
              <tr><td>Lifetime taxes (today's $)</td>{runs.map((r) => <td key={r.plan.id}>{money(r.proj.years.reduce((t, y, i) => t + y.taxes.total / r.d[i], 0))}</td>)}</tr>
            </tbody>
          </table>
        </Card>
      </>}
    </>
  );
}

export function ProgressPage() {
  const { plan, proj } = useProjection();
  const snapshots = useStore((s) => s.snapshots);
  const addSnapshot = useStore((s) => s.addSnapshot);
  const deleteSnapshot = useStore((s) => s.deleteSnapshot);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(plan.accounts.map((a) => [a.id, a.balance])));
  const total = (s: Snapshot) => Object.entries(s.balances).reduce((t, [id, v]) => t + (plan.accounts.find((a) => a.id === id)?.kind === 'debt' ? -v : v), 0);
  return (
    <>
      <Card title="Record today's balances">
        <div className="grid">
          <label className="field"><span>Date</span><div className="input"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></label>
          {plan.accounts.map((a) => <Num key={a.id} label={a.name} value={vals[a.id]} onChange={(v) => setVals({ ...vals, [a.id]: v })} />)}
        </div>
        <button onClick={() => addSnapshot({ id: uid(), date, balances: vals })}>Save snapshot</button>
      </Card>
      <Card title="Actual net worth against the plan (nominal dollars)" wide>
        <Chart option={{
          tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'time' }, yAxis: moneyAxis,
          series: [
            { name: 'Plan', type: 'line', symbol: 'none', data: proj.years.slice(0, 15).map((y) => [`${y.year}-01-01`, Math.round(y.netWorth)]) },
            { name: 'Actual', type: 'line', data: snapshots.map((s) => [s.date, Math.round(total(s))]) },
          ],
        }} />
        <table>
          <thead><tr><th>Date</th><th>Net worth</th><th></th></tr></thead>
          <tbody>{snapshots.map((s) => <tr key={s.id}><td>{s.date}</td><td>{money(total(s))}</td><td><button className="ghost danger" onClick={() => deleteSnapshot(s.id)}>Delete</button></td></tr>)}</tbody>
        </table>
      </Card>
    </>
  );
}

export function TablePage() {
  const { plan, proj, adj, real } = useProjection();
  const rows = proj.years.map((y, i) => ({
    Year: y.year,
    ...Object.fromEntries(plan.people.map((p) => [`Age ${p.name}`, y.ages[p.id]])),
    Income: adj(Object.values(y.income).reduce((t, v) => t + v, 0), i),
    'Social Security': adj(y.socialSecurity, i),
    Spending: adj(y.totalExpenses, i),
    Taxes: adj(y.taxes.total, i),
    Withdrawals: adj(Object.values(y.withdrawals).reduce((t, v) => t + v, 0), i),
    'Roth conversion': adj(y.rothConversion, i),
    RMD: adj(y.rmd, i),
    'Investment return': adj(y.investmentReturn, i),
    Investments: adj(y.liquidNetWorth, i),
    'Net worth': adj(y.netWorth, i),
  }));
  const cols = Object.keys(rows[0] ?? {});
  const csv = () => {
    const text = [cols.join(','), ...rows.map((r) => cols.map((c) => Math.round(Number((r as Record<string, number>)[c]))).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `${plan.name}.csv`;
    a.click();
  };
  return (
    <Card title={`Year by year (${dollarsNote(real)})`} wide actions={<button onClick={csv}>Download CSV</button>}>
      <div className="scroll">
        <table className="num">
          <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.Year}>{cols.map((c) => {
              const v = (r as Record<string, number>)[c];
              return <td key={c}>{c === 'Year' || c.startsWith('Age') ? v : money(v)}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}
