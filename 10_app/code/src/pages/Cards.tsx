// The card finder page (Bryce, 2026-11-23): the plan's card spending by category, filters, and the catalog's cards ranked by
// added value over the cards held; a card is added to the plan's accounts with its rates and fee in one tap.
import { useMemo, useState } from 'react';
import { SPEND_CATEGORIES, cardable, categoryOf, type SpendCategory } from '../engine/cards';
import { uid } from '../engine/defaults';
import { CATALOG_DATE, CATALOG_NOTE, findCards, type CatalogCard, type CreditTier } from '../engine/finder';
import { useStore } from '../store';
import { useProjection } from '../useProjection';
import { Card, Num, Select, money } from '../ui';

const PERKS: [string, string][] = [['travel', 'Travel rewards'], ['insurance', 'Insurance'], ['hotel', 'Hotel benefits'], ['phone', 'Phone protection'], ['foreign', 'No foreign fee'], ['credit', 'Builds credit']];

export function CardsPage() {
  const { plan, proj } = useProjection();
  const update = useStore((s) => s.update);
  const [credit, setCredit] = useState<CreditTier>('good');
  const [maxFee, setMaxFee] = useState<string>('any');
  const [minOn, setMinOn] = useState<SpendCategory | 'all'>('all');
  const [minRate, setMinRate] = useState(0);
  const [perks, setPerks] = useState<string[]>([]);
  const [new24, setNew24] = useState(0);
  const y = proj.years[0];
  const spend = useMemo(() => {
    const out: Partial<Record<SpendCategory, number>> = {};
    if (y) for (const e of plan.expenses) if (cardable(e) && (y.expenses[e.id] ?? 0) > 0) out[categoryOf(e)] = (out[categoryOf(e)] ?? 0) + y.expenses[e.id];
    return out;
  }, [plan, y]);
  const held = plan.accounts.filter((a) => a.kind === 'debt' && a.rewards?.length);
  const rows = useMemo(() => findCards(plan.startYear, spend, held, {
    credit, maxFee: maxFee === 'any' ? undefined : Number(maxFee), minRate: minRate || undefined, minRateOn: minOn, perks, newCards24: new24,
  }, held.map((h) => h.name)), [plan.startYear, spend, held, credit, maxFee, minRate, minOn, perks, new24]);
  const total = Object.values(spend).reduce((s, v) => s + v, 0);
  const add = (c: CatalogCard) => update((p) => {
    p.accounts.push({ id: 'a' + uid(), name: c.name, kind: 'debt', ownerId: p.people[0].id, balance: 0, allocation: { stocks: 0, bonds: 0, cash: 0 },
      rewards: structuredClone(c.rewards), annualFee: c.annualFee || undefined } as never);
  });
  const cats: [SpendCategory | 'all', string][] = [['all', 'All spending'], ...SPEND_CATEGORIES.map(([k, l]) => [k, l] as [SpendCategory, string])];
  return (
    <>
      <Card title="Your card spending a year">
        <ul className="budgetlist">
          {Object.entries(spend).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <li key={k}><span>{SPEND_CATEGORIES.find((c) => c[0] === k)?.[1] ?? k}</span><b>{money(v)}</b><em>{total ? Math.round((v / total) * 100) : 0}%</em></li>
          ))}
        </ul>
      </Card>
      <Card title="What you want">
        <div className="grid">
          <Select label="Your credit" value={credit} options={[['building', 'Building'], ['fair', 'Fair'], ['good', 'Good'], ['excellent', 'Excellent']]} onChange={setCredit} />
          <Select label="Annual fee" value={maxFee} options={[['any', 'Any'], ['0', 'None'], ['100', 'Up to $100']]} onChange={setMaxFee} />
          <Select label="Minimum cash back on" value={minOn} options={cats} onChange={setMinOn} />
          <Num label="Minimum cash back" percent value={minRate} onChange={setMinRate} />
          <Num label="New cards in the last 24 months" value={new24} onChange={(v) => setNew24(Math.max(0, v))} />
        </div>
        <div className="pills perkpills" role="group" aria-label="Perks wanted">
          {PERKS.map(([k, l]) => (
            <button type="button" key={k} data-value={k} className={perks.includes(k) ? 'on' : ''} onClick={() => setPerks(perks.includes(k) ? perks.filter((p) => p !== k) : [...perks, k])}>{l}</button>
          ))}
        </div>
      </Card>
      <div className="cardgrid">
        {rows.map((r) => (
          <section key={r.card.id} className={'cardtile' + (r.out ? ' out' : '')}>
            <header><b>{r.card.name}</b><small>{r.card.issuer}{r.card.annualFee ? ' · $' + r.card.annualFee + ' a year' : ' · no annual fee'}</small></header>
            <div className="cardvalue">
              <span className={r.value > 0 ? 'good' : ''}>{r.value >= 0 ? '+' : ''}{money(r.value)}</span><small>a year over your cards</small>
            </div>
            <ul className="cardrates">
              {r.card.rewards.map((x, i) => <li key={i}><b>{(x.rate * 100).toFixed(x.rate * 100 % 1 ? 1 : 0)}%</b> {x.category === 'all' ? 'everything else' : SPEND_CATEGORIES.find((c) => c[0] === x.category)?.[1].toLowerCase()}{x.capYearly ? ' (first ' + money(x.capYearly) + ' a year)' : ''}</li>)}
            </ul>
            {!!r.card.perks.length && <p className="muted">{r.card.perks.join(' · ')}</p>}
            {r.out ? <p className="why">{r.out}</p> : <button onClick={() => add(r.card)}>+ Add to my accounts</button>}
          </section>
        ))}
      </div>
    </>
  );
}
