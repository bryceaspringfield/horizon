// The spending log (Bryce, 2026-11-23): statements uploaded from the bank or card issuer (CSV, OFX, QFX) are parsed here in
// the browser, kept with the plan, and summed by month and category beside the plan's own spending.
import { useMemo, useState } from 'react';
import { SPEND_CATEGORIES, cardable, categoryOf } from '../engine/cards';
import { mergeLog, parseStatement, spendingByMonth, type Txn } from '../engine/statements';
import { useStore } from '../store';
import { useProjection } from '../useProjection';
import { Card, Select, money } from '../ui';

const CATS: [Txn['category'], string][] = [...SPEND_CATEGORIES.map(([k, l]) => [k, l] as [Txn['category'], string]), ['income', 'Income'], ['transfer', 'Transfer or card payment']];
const label = (c: string) => CATS.find((x) => x[0] === c)?.[1] ?? c;

export function SpendingPage() {
  const { plan, proj } = useProjection();
  const update = useStore((s) => s.update);
  const [msg, setMsg] = useState('');
  const log = plan.transactions ?? [];
  const byMonth = useMemo(() => spendingByMonth(log), [log]);
  const months = Object.keys(byMonth).sort();
  const avg: Record<string, number> = {};
  for (const m of months) for (const [c, v] of Object.entries(byMonth[m])) avg[c] = (avg[c] ?? 0) + (v ?? 0) / months.length;
  const y = proj.years[0];
  const planned: Record<string, number> = {};
  if (y) for (const e of plan.expenses) if (cardable(e)) planned[categoryOf(e)] = (planned[categoryOf(e)] ?? 0) + (y.expenses[e.id] ?? 0) / 12;
  const cats = [...new Set([...Object.keys(avg), ...Object.keys(planned)])].sort((a, b) => (avg[b] ?? 0) - (avg[a] ?? 0));
  const load = async (files: FileList | null) => {
    if (!files?.length) return;
    let add: Txn[] = [];
    for (const f of Array.from(files)) add = add.concat(parseStatement(f.name, await f.text()));
    const before = log.length;
    const next = mergeLog(log, add);
    update((p) => { p.transactions = next; });
    setMsg(add.length ? `${next.length - before} new transactions added (${add.length - (next.length - before)} already in the log).` : 'No transactions found: the file needs a header row with a date and an amount, or OFX tags.');
  };
  return (
    <>
      <Card title="Statements">
        <label className="upload">
          <input type="file" accept=".csv,.ofx,.qfx,text/csv" multiple onChange={(e) => { load(e.target.files); e.target.value = ''; }} />
          <span>Upload statements (CSV, OFX, or QFX)</span>
        </label>
        {msg && <p className="muted">{msg}</p>}
        {!!log.length && <p className="muted">{log.length} transactions, {months.length} months{months.length ? `, ${months[0]} to ${months[months.length - 1]}` : ''}. <button className="link" onClick={() => { update((p) => { p.transactions = undefined; }); setMsg('The log is cleared.'); }}>Clear the log</button></p>}
      </Card>
      {!!cats.length && (
        <Card title="A month, by category">
          <ul className="budgetlist spendcmp">
            <li className="head"><span>Category</span><b>Spent</b><b>Planned</b><em>Gap</em></li>
            {cats.map((c) => {
              const gap = (avg[c] ?? 0) - (planned[c] ?? 0);
              return <li key={c}><span>{label(c)}</span><b>{money(avg[c] ?? 0)}</b><b>{money(planned[c] ?? 0)}</b><em className={gap > 1 ? 'over' : ''}>{gap > 1 ? '+' : ''}{money(gap)}</em></li>;
            })}
          </ul>
        </Card>
      )}
      {!!log.length && (
        <Card title="Transactions">
          <ul className="txns">
            {log.slice(0, 300).map((t) => (
              <li key={t.id}>
                <span className="d">{t.date}</span><span className="n">{t.description}</span>
                <b className={t.amount < 0 ? '' : 'in'}>{money(t.amount)}</b>
                <Select label="" value={t.category} options={CATS} onChange={(v) => update((p) => { const x = p.transactions!.find((z) => z.id === t.id); if (x) x.category = v; })} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
