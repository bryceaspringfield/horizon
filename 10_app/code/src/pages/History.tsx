// Net worth history (2026-11-23): tracked balances by date, ranges, the change, and the latest composition (engine/history.ts).
import { useState } from 'react';
import { RANGES, history, snapshotNow, type Range } from '../engine/history';
import { useStore } from '../store';
import { useProjection } from '../useProjection';
import { Card, Chart, Num, Stat, money, moneyAxis, moneyTooltip } from '../ui';

export function HistoryPage() {
  const { plan } = useProjection();
  const update = useStore((s) => s.update);
  const [range, setRange] = useState<Range>('All');
  const snaps = plan.snapshots ?? [];
  const h = history(snaps, plan.accounts, range);
  const last = h.points[h.points.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  const record = () => update((p) => {
    const s = snapshotNow(p, today);
    p.snapshots = [...(p.snapshots ?? []).filter((x) => x.date !== today), s];
  });
  return (
    <>
      <Card title="Net worth history" actions={<button onClick={record}>+ Record today's balances</button>}>
        <div className="pills">
          {RANGES.map((r) => <button key={r} type="button" className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}
        </div>
        {last && <>
          <div className="stats">
            <Stat label="Net worth" value={money(last.netWorth)} />
            <Stat label={`Change, ${range}`} value={money(h.change)} sub={`${(h.changeShare * 100).toFixed(1)}%`} />
            <Stat label="Investable assets" value={money(last.investable)} />
            <Stat label="Liquid assets" value={money(last.liquid)} />
            <Stat label="Liquid net worth" value={money(last.liquidNetWorth)} />
          </div>
          <Chart height={300} option={{
            tooltip: moneyTooltip, legend: {}, xAxis: { type: 'time' }, yAxis: moneyAxis,
            series: [
              { name: 'Net worth', type: 'line', data: h.points.map((p) => [p.date, p.netWorth]) },
              { name: 'Liquid net worth', type: 'line', data: h.points.map((p) => [p.date, p.liquidNetWorth]) },
            ],
          }} />
          <Chart height={90} option={{
            tooltip: moneyTooltip, legend: {}, grid: { top: 30, bottom: 10 }, xAxis: { type: 'value', show: false }, yAxis: { type: 'category', data: [''], show: false },
            series: [['Investable assets', last.investable], ['Other liquid assets', last.liquid - last.investable], ['Other assets, net', last.netWorth - last.liquidNetWorth]]
              .map(([name, v]) => ({ name, type: 'bar', stack: 'c', data: [Math.max(0, v as number)] })),
          }} />
        </>}
      </Card>
      {!!snaps.length && <Card title="Recorded balances">
        {[...snaps].sort((a, b) => b.date.localeCompare(a.date)).map((s) => (
          <div key={s.date} className="row">
            <label className="field"><span>Date</span><div className="input"><input type="date" value={s.date} onChange={(e) => e.target.value && update((p) => { const t = p.snapshots!.find((x) => x.date === s.date)!; t.date = e.target.value; })} /></div></label>
            {plan.accounts.map((a) => (
              <Num key={a.id} label={a.name} value={s.balances[a.id] ?? 0} onChange={(v) => update((p) => { p.snapshots!.find((x) => x.date === s.date)!.balances[a.id] = v; })} />
            ))}
            <button className="ghost danger" onClick={() => update((p) => { p.snapshots = p.snapshots!.filter((x) => x.date !== s.date); })}>Remove</button>
          </div>
        ))}
      </Card>}
    </>
  );
}
