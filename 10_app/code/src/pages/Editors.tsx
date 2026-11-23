import { useState } from 'react';
// The pages where the plan is entered: people, accounts, income, Social Security, expenses, milestones, the strategy,
// and the assumptions.
import { uid } from '../engine/defaults';
import healthJson from '../data/healthcare.json';
import type { Person, PayDeduction, LocalTax, Account, AccountKind, Expense, ExpenseKind, Income, IncomeKind, LifeEvent, Milestone, Step, Transfer, WithdrawalStep } from '../engine/types';
import { estimatePia } from '../engine/retirement';
import { useProjection } from '../useProjection';
import statesJson from '../data/states.json';
import { useActivePlan, useStore } from '../store';
import { Card, Chart, Check, ListEditor, Num, Select, Stat, Text, money, pct } from '../ui';
import { CURRENCIES, foreignCurrencies, formatMoney, planCurrency } from '../engine/currency';
import { benefitAtClaim } from '../engine/retirement';
import { refLabel, type DateRef } from '../engine/dates';
import { MARKET, assumptionAt, consensus } from '../engine/assumptions';
import { PROVINCES } from '../engine/ca';
import { MIT, applyMit, type MitGroup, type MitPlan, type MitTier } from '../engine/benefits';
import { CONDITIONS, RACES, expectedDeathDate } from '../engine/lifespan';
import { DIETS, FOOD_PLANS } from '../engine/food';
import { ADOPTION_ROUTES, ADOPTION_SOURCE, BIRTH_SOURCE, WEDDING_SOURCES, WEDDING_STYLES, adoptionCost, birthCost, weddingCost } from '../engine/lifeCosts';
import { SPEND_CATEGORIES, categoryOf, type RewardRate, type SpendCategory } from '../engine/cards';

const ACCOUNT_KINDS: [AccountKind, string][] = [
  ['cash', 'Cash (checking, savings)'], ['taxable', 'Taxable brokerage'], ['traditional', 'Traditional 401(k) / IRA'],
  ['roth', 'Roth 401(k) / IRA'], ['hsa', 'HSA'], ['college529', '529 college savings'], ['asset', 'Asset (home, car)'], ['debt', 'Debt (mortgage, loan)'],
];
const INCOME_KINDS: [IncomeKind | 'socialSecurity' | 'ssdi', string][] = [
  ['salary', 'Salary'], ['selfEmployment', 'Self-employment'], ['rental', 'Rental'], ['pension', 'Pension'], ['annuity', 'Annuity'], ['windfall', 'One-time windfall'], ['options', 'Stock options (exercised and held)'], ['rsu', 'RSU grant (total value)'], ['bonus', 'Bonus (taxed as wages)'], ['socialSecurity', 'Social Security (retirement)'], ['ssdi', 'Social Security disability (SSDI)'], ['accountBonus', 'Account or referral bonus (one-time)'], ['settlement', 'Settlement payout (one-time)'], ['other', 'Other'],
];
const BONUS_SOURCES: [NonNullable<Income['bonusSource']>, string][] = [['card', 'Credit card'], ['bank', 'Bank'], ['brokerage', 'Brokerage'], ['referral', 'Referral']];
const EXPENSE_KINDS: [ExpenseKind, string][] = [
  ['living', 'Living expenses'], ['housing', 'Housing'], ['healthcare', 'Healthcare'], ['education', 'Education'], ['travel', 'Travel'], ['insurance', 'Insurance'], ['longTermCare', 'Long-term care'], ['childcare', 'Childcare (counts toward the care credit)'], ['transportation', 'Transportation'], ['pets', 'Pets'], ['homeProjects', 'Home projects'], ['oneTime', 'One-time'], ['other', 'Other'],
];

/** The currency of one account, income, or expense: the plan's by default. Choosing another adds its exchange rate to
 *  the Assumptions page, at 1 until set. */
function CurrencySelect({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const home = planCurrency(useActivePlan());
  const update = useUpdate();
  const options: [string, string][] = [[home, `${home} (the plan's currency)`], ...CURRENCIES.filter(([c]) => c !== home).map(([c, n]) => [c, `${c}: ${n}`] as [string, string])];
  if (value && !options.some(([c]) => c === value)) options.push([value, value]);
  return <Select label="Currency" value={value ?? home} options={options} onChange={(v) => {
    onChange(v === home ? undefined : v);
    if (v !== home) update((p) => { p.assumptions.fx = { [v]: { rate: 1, drift: 0 }, ...p.assumptions.fx }; });
  }} />;
}

/** A US person living abroad: the foreign earned income exclusion and the housing exclusion. */
function ExpatCard() {
  const plan = useActivePlan();
  const update = useUpdate();
  const e = plan.assumptions.expat ?? { exclusion: false, housing: 0 };
  const abroad = plan.incomes.some((i) => i.abroad);
  if (plan.assumptions.taxModel?.kind === 'flat') return null;
  return (
    <Card title="Living abroad as a US person">
      <div className="grid">
        <Check label="Claim the foreign earned income exclusion" value={e.exclusion} onChange={(v) => update((p) => { p.assumptions.expat = { ...e, exclusion: v }; })} />
        {e.exclusion && <Num label="Yearly housing cost abroad (today's $)" step={500} value={e.housing} hint="Rent, utilities, and insurance abroad. The part between 16% and 30% of the exclusion limit is excluded too." onChange={(v) => update((p) => { p.assumptions.expat = { ...e, housing: v }; })} />}
      </div>
    </Card>
  );
}

/** The plan's currency and the exchange-rate assumption of each foreign currency its items use. */
function CurrencyCard() {
  const plan = useActivePlan();
  const update = useUpdate();
  const home = planCurrency(plan);
  const foreign = foreignCurrencies(plan);
  const options: [string, string][] = CURRENCIES.map(([c, n]) => [c, `${c}: ${n}`]);
  if (!options.some(([c]) => c === home)) options.push([home, home]);
  return (
    <Card title="Currency and exchange rates">
      <div className="grid">
        <Select label="Plan currency" value={home} options={options} onChange={(v) => update((p) => { p.currency = v === 'USD' ? undefined : v; })} />
      </div>
      {foreign.map((c) => {
        const f = plan.assumptions.fx?.[c] ?? { rate: 1, drift: 0 };
        const set = (patch: Partial<typeof f>) => update((p) => { p.assumptions.fx = { ...p.assumptions.fx, [c]: { ...f, ...patch } }; });
        return (
          <div className="grid" key={c}>
            <Num label={`1 ${c} in ${home} today`} step={0.0001} value={f.rate} onChange={(v) => set({ rate: v })} />
            <Num label={`Yearly change of ${c} in ${home}`} percent value={f.drift} onChange={(v) => set({ drift: v })} hint="Positive: the foreign currency gains on the plan's currency each year." />
            <div className="field"><span>Example</span><div className="muted">{formatMoney(1000, c)} is {formatMoney(1000 * f.rate, home)} today</div></div>
          </div>
        );
      })}
      {foreign.length > 0 && <p className="muted small">Amounts convert at today's rate, and incomes, expenses, assets, and debts then follow the yearly change. Investment accounts convert at today's rate and follow the plan's market returns.</p>}
    </Card>
  );
}

function useUpdate() {
  return useStore((s) => s.update);
}

/** A card's earning rates: each on a category or on all spending, with an optional yearly cap, and a bonus rate which
 * ends in a year and falls to a lower rate. */
function RatesEditor({ rates, onChange }: { rates?: RewardRate[]; onChange: (r: RewardRate[]) => void }) {
  const list = rates ?? [];
  const cats: [RewardRate['category'], string][] = [['all', 'All spending'], ...SPEND_CATEGORIES.map(([k, l]) => [k, l] as [RewardRate['category'], string])];
  const set = (i: number, f: (r: RewardRate) => void) => { const next = structuredClone(list); f(next[i]); onChange(next); };
  return (
    <div className="span rates">
      <strong>Earning rates</strong>
      {list.map((r, i) => (
        <div key={i} className="grid rate">
          <Select label="On" value={r.category} options={cats} onChange={(v) => set(i, (x) => { x.category = v; })} />
          <Num label="Cash back" percent value={r.rate} onChange={(v) => set(i, (x) => { x.rate = v; })} />
          <Num label="Up to a year (0: no cap)" value={r.capYearly ?? 0} onChange={(v) => set(i, (x) => { x.capYearly = v || undefined; })} />
          <Num label="Bonus rate ends after (0: never)" value={r.untilYear ?? 0} onChange={(v) => set(i, (x) => { x.untilYear = v || undefined; })} />
          {!!r.untilYear && <Num label="Then" percent value={r.thenRate ?? 0} onChange={(v) => set(i, (x) => { x.thenRate = v; })} />}
          <button className="ghost danger" onClick={() => onChange(list.filter((_, k) => k !== i))}>Remove</button>
        </div>
      ))}
      <button className="ghost" onClick={() => onChange([...list, { category: list.length ? 'groceries' : 'all', rate: list.length ? 0.03 : 0.015 }])}>+ Earning rate</button>
    </div>
  );
}

/** When an income or expense starts or ends (engine/dates.ts): a year, a date picked on a calendar, a life event (its
 * start or end), a milestone, a person's age, or a person's retirement. A tied point follows its event or milestone. */
function WhenField({ label, value, year, onChange, onYear, defaultLabel }: {
  label: string; value?: DateRef; year?: number; onChange: (r: DateRef | undefined) => void; onYear: (y: number | undefined) => void; defaultLabel?: string;
}) {
  const plan = useActivePlan();
  const mode = value?.kind ?? (defaultLabel && !year ? 'default' : 'year');
  const events = (plan.events ?? []).map((e) => [e.id, e.name] as [string, string]);
  const people = plan.people.map((p) => [p.id, p.name] as [string, string]);
  const modes: [string, string][] = [...(defaultLabel ? [['default', defaultLabel]] as [string, string][] : []), ['year', 'Year'], ['date', 'Date'], ['event', 'Life event'], ['milestone', 'Milestone'], ['age', 'Age'], ['retirement', 'Retirement']];
  const pick = (m: string) => {
    if (m === 'default') { onChange(undefined); onYear(undefined); }
    else if (m === 'year') { onChange(undefined); onYear(year ?? plan.startYear + 5); }
    else if (m === 'date') onChange({ kind: 'date', date: (year ?? plan.startYear) + '-01-01' });
    else if (m === 'event') onChange(events.length ? { kind: 'event', eventId: events[0][0] } : undefined);
    else if (m === 'milestone') onChange(plan.milestones.length ? { kind: 'milestone', milestoneId: plan.milestones[0].id } : undefined);
    else if (m === 'age') onChange({ kind: 'age', personId: people[0][0], age: 65 });
    else onChange({ kind: 'retirement', personId: people[0][0] });
  };
  return (
    <div className="field when span">
      <span>{label}</span>
      <div className="whenrow">
        <Select label="" value={mode} options={modes} onChange={pick} />
        {mode === 'year' && <Num label="" value={year ?? plan.startYear} onChange={(v) => onYear(v)} />}
        {value?.kind === 'date' && (
          <label className="field"><div className="input"><input type="date" value={value.date} onChange={(e) => { onChange({ kind: 'date', date: e.target.value }); if (e.target.value) onYear(Number(e.target.value.slice(0, 4))); }} /></div></label>
        )}
        {value?.kind === 'event' && <>
          <Select label="" value={value.eventId} options={events} onChange={(v) => onChange({ ...value, eventId: v })} />
          <Select label="" value={value.at ?? 'start'} options={[['start', 'Its start'], ['end', 'Its end']]} onChange={(v) => onChange({ ...value, at: v })} />
        </>}
        {value?.kind === 'milestone' && <Select label="" value={value.milestoneId} options={plan.milestones.map((m) => [m.id, m.name] as [string, string])} onChange={(v) => onChange({ ...value, milestoneId: v })} />}
        {(value?.kind === 'age' || value?.kind === 'retirement') && <Select label="" value={value.personId} options={people} onChange={(v) => onChange({ ...value, personId: v })} />}
        {value?.kind === 'age' && <Num label="" value={value.age} onChange={(v) => onChange({ ...value, age: v })} />}
      </div>
      {mode === 'event' && !events.length && <small className="muted">Add a life event first.</small>}
      {mode === 'milestone' && !plan.milestones.length && <small className="muted">Add a milestone first.</small>}
      {value && value.kind !== 'year' as string && value.kind !== 'date' && <small className="muted">{refLabel(value, plan)}</small>}
    </div>
  );
}

/** Changes of an income's or expense's yearly amount from a year on. */
function StepsEditor({ steps, nominal, onChange }: { steps?: Step[]; nominal?: boolean; onChange: (s: Step[]) => void }) {
  const list = steps ?? [];
  const put = (j: number, f: (x: Step) => Step) => onChange(list.map((x, k) => (k === j ? f(x) : x)));
  return (
    <div className="span steps">
      {list.map((st, j) => (
        <div key={j} className="row">
          <label className="field"><span>Changes on</span><div className="input"><input type="date" value={st.date ?? st.year + '-01-01'} onChange={(e) => { const d = e.target.value; if (d) put(j, (x) => ({ ...x, date: d.endsWith('-01-01') ? undefined : d, year: Number(d.slice(0, 4)) })); }} /></div></label>
          <Num label="New yearly amount" value={st.amount} onChange={(v) => put(j, (x) => ({ ...x, amount: v }))} />
          <Select label="In" value={(st.nominal ?? nominal) ? 'nominal' : 'today'} options={[['today', "Today's dollars"], ['nominal', 'Dollars of that date']]} onChange={(v) => put(j, (x) => ({ ...x, nominal: v === 'nominal' }))} />
          <button className="ghost danger" onClick={() => onChange(list.filter((_, k) => k !== j))}>Remove</button>
        </div>
      ))}
      <button className="ghost" onClick={() => onChange([...list, { year: new Date().getFullYear() + 1, amount: 0 }])}>+ A change in amount</button>
    </div>
  );
}

/** MIT's 2026 benefits applied to a salary: the pay group, the medical plan, and who is covered. */
function MitPreset({ onApply }: { onApply: (g: MitGroup, p: MitPlan, t: MitTier) => void }) {
  const [g, setG] = useState<MitGroup>('staff');
  const [p, setP] = useState<MitPlan>('ppo');
  const [t, setT] = useState<MitTier>('employee');
  return (
    <div className="span row">
      <Select label="MIT pay group" value={g} options={Object.entries(MIT.groups).map(([k, v]) => [k as MitGroup, v.label])} onChange={setG} />
      <Select label="MIT medical plan" value={p} options={[['ppo', MIT.medical.ppo.name], ['hdhp', MIT.medical.hdhp.name]]} onChange={setP} />
      <Select label="Covered" value={t} options={MIT.tiers as [MitTier, string][]} onChange={setT} />
      <button className="ghost" onClick={() => onApply(g, p, t)}>Apply MIT's {MIT.year} benefits</button>
    </div>
  );
}

/** Stretches when someone else pays all or part of an expense: from a date, to a date or for good, the share, and who. */
function PaidByEditor({ list, start, onChange }: { list?: { from: string; to?: string; share: number; who?: string }[]; start: number; onChange: (l: { from: string; to?: string; share: number; who?: string }[]) => void }) {
  const ps = list ?? [];
  const put = (j: number, f: (x: (typeof ps)[number]) => (typeof ps)[number]) => onChange(ps.map((x, k) => (k === j ? f(x) : x)));
  return (
    <div className="span steps">
      {!!ps.length && <strong>Paid by someone else</strong>}
      {ps.map((b, j) => (
        <div key={j} className="row">
          <Text label="Who pays" value={b.who ?? ''} onChange={(v) => put(j, (x) => ({ ...x, who: v || undefined }))} />
          <Num label="Share they pay" percent value={b.share} onChange={(v) => put(j, (x) => ({ ...x, share: Math.max(0, Math.min(1, v)) }))} />
          <label className="field"><span>From</span><div className="input"><input type="date" value={b.from} onChange={(e) => e.target.value && put(j, (x) => ({ ...x, from: e.target.value }))} /></div></label>
          <label className="field"><span>Until (blank: for good)</span><div className="input"><input type="date" value={b.to ?? ''} onChange={(e) => put(j, (x) => ({ ...x, to: e.target.value || undefined }))} /></div></label>
          <button className="ghost danger" onClick={() => onChange(ps.filter((_, k) => k !== j))}>Remove</button>
        </div>
      ))}
      <button className="ghost" onClick={() => onChange([...ps, { from: start + '-01-01', share: 1 }])}>+ Paid by someone else</button>
    </div>
  );
}

/** A salary's paycheck deductions other than retirement contributions, each with its tax treatment. */
function DeductionsEditor({ list, onChange }: { list?: PayDeduction[]; onChange: (d: PayDeduction[]) => void }) {
  const ds = list ?? [];
  const put = (j: number, f: (x: PayDeduction) => PayDeduction) => onChange(ds.map((x, k) => (k === j ? f(x) : x)));
  return (
    <div className="span steps">
      <strong>Paycheck deductions</strong>
      {ds.map((d, j) => (
        <div key={j} className="row">
          <Text label="Deduction" value={d.name} onChange={(v) => put(j, (x) => ({ ...x, name: v }))} />
          <Num label="Amount" value={d.amount} onChange={(v) => put(j, (x) => ({ ...x, amount: Math.max(0, v) }))} />
          <Select label="Per" value={d.per} options={[['paycheck', 'Paycheck'], ['year', 'Year']]} onChange={(v) => put(j, (x) => ({ ...x, per: v }))} />
          <Select label="Taxes" value={d.treatment} options={[['all', 'Excluded from all taxable wages'], ['incomeTax', 'Excluded from federal and state wages'], ['none', 'Not excluded']]} onChange={(v) => put(j, (x) => ({ ...x, treatment: v }))} />
          <button className="ghost danger" onClick={() => onChange(ds.filter((_, k) => k !== j))}>Remove</button>
        </div>
      ))}
      <div className="chips">
        {DEDUCTION_PRESETS.map(([name, treatment]) => (
          <button key={name} className="ghost" onClick={() => onChange([...ds, { name, amount: 0, per: 'paycheck', treatment }])}>+ {name}</button>
        ))}
      </div>
    </div>
  );
}

const DEDUCTION_PRESETS: [string, PayDeduction['treatment']][] = [
  ['Health insurance', 'all'], ['Dental', 'all'], ['Vision', 'all'], ['FSA: health care', 'all'], ['FSA: dependent care', 'all'],
  ['Commuter benefits', 'all'], ['Life or disability insurance', 'none'], ['Union dues', 'none'], ['Other', 'none'],
];

/** The expected death of a person from their details (engine/lifespan.ts). */
function lifeOf(q: Person) {
  return expectedDeathDate(q.birthDate ?? q.birthYear + '-07-01', q.sex ?? 'unknown', q.race ?? 'all', q.conditions ?? []);
}
/** Fills a person's plan-to age from the expected age at death, unless they set their own. */
function lifeFill(q: Person) {
  if (!q.ownLife) q.lifeExpectancy = Math.round(lifeOf(q).age);
}

export function PeoplePage() {
  const plan = useActivePlan();
  const update = useUpdate();
  const mainId = useStore((s) => s.settings.mainPlanId);
  const main = useStore((s) => s.plans.find((p) => p.id === mainId));
  return (
    <>
      <Card title="Plan">
        <div className="grid">
          <Text label="Plan name" value={plan.name} onChange={(v) => update((p) => { p.name = v; })} />
          <Num label="First year" value={plan.startYear} onChange={(v) => update((p) => { p.startYear = v; })} />
          <Select label="Filing status" value={plan.assumptions.filingStatus} options={[['mfj', 'Married filing jointly'], ['single', 'Single'], ['hoh', 'Head of household']]}
            onChange={(v) => update((p) => { p.assumptions.filingStatus = v; })} />
          <Select label="State" value={plan.assumptions.state} options={Object.keys(statesJson).sort().map((k) => [k, k] as [string, string])}
            onChange={(v) => update((p) => { p.assumptions.state = v; })} />
          {main && main.id !== plan.id && <div className="span">
            <Check label={`Starting finances follow the main plan (${main.name}): its people, first year, and accounts`} value={!!plan.followsMain}
              onChange={(v) => update((p) => { p.followsMain = v; if (v) { p.people = structuredClone(main.people); p.startYear = main.startYear; p.accounts = structuredClone(main.accounts); } })} />
          </div>}
        </div>
        <p className="muted">{plan.followsMain ? 'Edits to the main plan\'s people and accounts carry over to this plan.' : 'This plan has custom starting conditions: its own first year, people, and balances, which can describe a hypothetical start (a later year, other balances).'}</p>
      </Card>
      <Card title="Defaults for everyone">
        <div className="grid">
          <Select label="Plan everyone to" value={plan.assumptions.planTo?.mode ?? 'person'} options={[['person', "Each person's own age"], ['age', 'One age'], ['year', 'A year']]} onChange={(v) => update((p) => { p.assumptions.planTo = v === 'person' ? undefined : { mode: v, age: p.assumptions.planTo?.age ?? 95, year: p.assumptions.planTo?.year ?? p.startYear + 60 }; })} />
          {plan.assumptions.planTo?.mode === 'age' && <Num label="Plan to age (everyone)" value={plan.assumptions.planTo.age ?? 95} onChange={(v) => update((p) => { p.assumptions.planTo = { ...p.assumptions.planTo!, age: v }; })} />}
          {plan.assumptions.planTo?.mode === 'year' && <Num label="Plan to year" value={plan.assumptions.planTo.year ?? plan.startYear + 60} onChange={(v) => update((p) => { p.assumptions.planTo = { ...p.assumptions.planTo!, year: v }; })} />}
          <Num label="Retirement age (everyone; 0: each person's own)" value={plan.assumptions.retirementAgeAll ?? 0} onChange={(v) => update((p) => { p.assumptions.retirementAgeAll = v || undefined; })} />
        </div>
      </Card>
      <Card title="People">
        <ListEditor
          items={plan.people}
          title={(p) => `${p.name}, born ${p.birthYear}`}
          empty="Add yourself first."
          onAdd={() => update((p) => { const q: Person = { id: 'p' + uid(), name: '', birthYear: p.startYear - 30, lifeExpectancy: 0 }; lifeFill(q); p.people.push(q); })}
          onRemove={(i) => update((p) => { if (p.people.length > 1) p.people.splice(i, 1); })}
          render={(person, i) => (
            <>
              <Text label="Name" value={person.name} onChange={(v) => update((p) => { p.people[i].name = v; })} />
              <label className="field"><span>Birth date</span><div className="input"><input type="date" value={person.birthDate ?? person.birthYear + '-07-01'} onChange={(e) => { const d = e.target.value; if (d) update((p) => { const q = p.people[i]; q.birthDate = d; q.birthYear = Number(d.slice(0, 4)); lifeFill(q); }); }} /></div></label>
              <Select label="Sex" value={person.sex ?? 'unknown'} options={[['unknown', 'Not given'], ['female', 'Female'], ['male', 'Male']]} onChange={(v) => update((p) => { p.people[i].sex = v; lifeFill(p.people[i]); })} />
              <Select label="Race or Hispanic origin" value={person.race ?? 'all'} options={RACES} onChange={(v) => update((p) => { p.people[i].race = v; lifeFill(p.people[i]); })} />
              <div className="field span"><span>Health</span><div className="pills">
                {CONDITIONS.map((c) => {
                  const on = (person.conditions ?? []).includes(c.key);
                  return <button type="button" key={c.key} title={c.source} className={on ? 'on' : ''} onClick={() => update((p) => { const q = p.people[i]; q.conditions = on ? (q.conditions ?? []).filter((k) => k !== c.key) : [...(q.conditions ?? []), c.key]; lifeFill(q); })}>{c.label}</button>;
                })}
              </div></div>
              <Select label="Food spending" value={person.foodPlan ?? 'moderate'} options={FOOD_PLANS} onChange={(v) => update((p) => { p.people[i].foodPlan = v; })} />
              <Select label="Diet" value={person.diet ?? 'omnivore'} options={DIETS} onChange={(v) => update((p) => { p.people[i].diet = v; })} />
              <Check label="Food paid by someone else" value={!!person.foodPaidByOthers} onChange={(v) => update((p) => { p.people[i].foodPaidByOthers = v || undefined; })} />
              <label className="field"><span>Joins the household</span><div className="input"><input type="date" value={person.joins ?? ''} onChange={(e) => update((p) => { p.people[i].joins = e.target.value || undefined; })} /></div></label>
              <label className="field"><span>Leaves the household</span><div className="input"><input type="date" value={person.leaves ?? ''} onChange={(e) => update((p) => { p.people[i].leaves = e.target.value || undefined; })} /></div></label>
              <Check label="Set my own plan-to age" value={!!person.ownLife} onChange={(v) => update((p) => { p.people[i].ownLife = v || undefined; lifeFill(p.people[i]); })} />
              {!person.ownLife && <div className="field"><span>Expected death</span><div className="muted">{lifeOf(person).date} (age {lifeOf(person).age.toFixed(1)})</div></div>}
              {plan.assumptions.planTo && plan.assumptions.planTo.mode !== 'person' && <Check label="Own plan-to age" value={!!person.ownPlanTo} onChange={(v) => update((p) => { p.people[i].ownPlanTo = v || undefined; })} />}
              {person.ownLife && (!plan.assumptions.planTo || plan.assumptions.planTo.mode === 'person' || person.ownPlanTo) && <Num label="Plan to age" value={person.lifeExpectancy} onChange={(v) => update((p) => { p.people[i].lifeExpectancy = v; })} />}
              {!!plan.assumptions.retirementAgeAll && <Check label="Own retirement age" value={!!person.ownRetirementAge} onChange={(v) => update((p) => { p.people[i].ownRetirementAge = v || undefined; })} />}
              {(!plan.assumptions.retirementAgeAll || person.ownRetirementAge) && <Num label="Retirement age" value={plan.strategy.retirementAge[person.id]} onChange={(v) => update((p) => { p.strategy.retirementAge[person.id] = v; })} />}
            </>
          )}
        />
      </Card>
    </>
  );
}

function PayoffYear({ id }: { id: string }) {
  const { proj } = useProjection();
  const owing = proj.years.findIndex((r) => (r.balances[id] ?? 0) < -1);
  const paid = owing < 0 ? undefined : proj.years.slice(owing).find((r) => (r.balances[id] ?? 0) > -1);
  return <div className="field"><span>Paid off</span><div className="readout">{owing < 0 ? 'Not owed' : paid ? paid.year : 'After the plan'}</div></div>;
}

export function AccountsPage() {
  const plan = useActivePlan();
  const update = useUpdate();
  const owner = plan.people.map((p) => [p.id, p.name] as [string, string]);
  const total = (kinds: AccountKind[]) => plan.accounts.filter((a) => kinds.includes(a.kind)).reduce((t, a) => t + a.balance, 0);
  const assets = plan.accounts.filter((a) => a.kind === 'asset').map((a) => [a.id, a.name] as [string, string]);
  return (
    <>
      <div className="stats">
        <div className="stat"><div className="label">Investments</div><div className="value">{money(total(['cash', 'taxable', 'traditional', 'roth', 'hsa', 'college529']))}</div></div>
        <div className="stat"><div className="label">Assets</div><div className="value">{money(total(['asset']))}</div></div>
        <div className="stat"><div className="label">Debts</div><div className="value">{money(-total(['debt']))}</div></div>
        <div className="stat"><div className="label">Net worth</div><div className="value">{money(total(['cash', 'taxable', 'traditional', 'roth', 'hsa', 'college529', 'asset']) - total(['debt']))}</div></div>
      </div>
      <Card title="Accounts, assets, and debts">
        <ListEditor<Account>
          items={plan.accounts}
          title={(a) => `${a.name} · ${ACCOUNT_KINDS.find((k) => k[0] === a.kind)?.[1]} · ${money(a.kind === 'debt' ? -a.balance : a.balance)}`}
          empty="Add your accounts."
          onAdd={() => update((p) => { p.accounts.push({ id: 'a' + uid(), name: 'New account', kind: 'taxable', ownerId: p.people[0].id, balance: 0, costBasis: 0, allocation: { stocks: 0.8, bonds: 0.2, cash: 0 } }); })}
          onRemove={(i) => update((p) => { p.accounts.splice(i, 1); })}
          render={(a, i) => {
            const set = (fn: (x: Account) => void) => update((p) => fn(p.accounts[i]));
            const invested = !['asset', 'debt', 'cash'].includes(a.kind);
            return (
              <>
                <Text label="Name" value={a.name} onChange={(v) => set((x) => { x.name = v; })} />
                <CurrencySelect value={a.currency} onChange={(v) => set((x) => { x.currency = v; })} />
                <Select label="Type" value={a.kind} options={ACCOUNT_KINDS} onChange={(v) => set((x) => { x.kind = v; })} />
                <Select label="Owner" value={a.ownerId} options={owner} onChange={(v) => set((x) => { x.ownerId = v; })} />
                <Num label={a.kind === 'debt' ? 'Amount owed' : 'Balance'} value={a.balance} onChange={(v) => set((x) => { x.balance = v; })} />
                {a.kind === 'taxable' && <Num label="Cost basis" value={a.costBasis} onChange={(v) => set((x) => { x.costBasis = v; })} />}
                {invested && <>
                  <Num label="Stocks" percent value={a.allocation.stocks} onChange={(v) => set((x) => { x.allocation.stocks = v; x.allocation.bonds = Math.max(0, 1 - v - x.allocation.cash); })} />
                  <Num label="Bonds" percent value={a.allocation.bonds} onChange={(v) => set((x) => { x.allocation.bonds = v; })} />
                  <Num label="Cash" percent value={a.allocation.cash} onChange={(v) => set((x) => { x.allocation.cash = v; })} />
                  <Num label="Yearly fee" percent step={0.01} value={a.fee ?? 0} onChange={(v) => set((x) => { x.fee = v; })} />
                  <Select label="Withdrawals allowed" value={a.withdrawRule ?? 'always'} options={[['always', 'Any time'], ['qualifiedAge', 'From a qualified age'], ['year', 'From a year'], ['never', 'Never (kept whole)']]} onChange={(v) => set((x) => { x.withdrawRule = v === 'always' ? undefined : v; })} />
                  {(a.withdrawRule === 'qualifiedAge' || a.kind === 'traditional' || a.liquidFrom === 'qualifiedAge') && <Num label="Qualified age" value={a.qualifiedAge ?? 59.5} step={0.5} onChange={(v) => set((x) => { x.qualifiedAge = v === 59.5 ? undefined : v; })} />}
                  {a.withdrawRule === 'year' && <Num label="Withdrawals from year" value={a.withdrawYear ?? plan.startYear} onChange={(v) => set((x) => { x.withdrawYear = v; })} />}
                  <Select label="Counts as liquid" value={a.liquidFrom ?? 'now'} options={[['now', 'Now'], ['qualifiedAge', 'From the qualified age'], ['year', 'From a year'], ['never', 'Never']]} onChange={(v) => set((x) => { x.liquidFrom = v === 'now' ? undefined : v; })} />
                  {a.liquidFrom === 'year' && <Num label="Liquid from year" value={a.liquidYear ?? plan.startYear} onChange={(v) => set((x) => { x.liquidYear = v; })} />}
                </>}
                {(invested || a.kind === 'cash') && <>
                  <Check label="Its own yearly return, not the market mix" value={typeof a.customReturn === 'number'} onChange={(v) => set((x) => { x.customReturn = v ? 0.05 : undefined; })} />
                  {typeof a.customReturn === 'number' && <Num label="Yearly return (after fees)" percent value={a.customReturn} onChange={(v) => set((x) => { x.customReturn = v; })} />}
                  <Check label="Return tied to inflation (Series I bonds, TIPS)" value={typeof a.inflationLinked === 'number'} onChange={(v) => set((x) => { x.inflationLinked = v ? 0.01 : undefined; })} />
                  {typeof a.inflationLinked === 'number' && <Num label="Fixed rate above inflation" percent value={a.inflationLinked} onChange={(v) => set((x) => { x.inflationLinked = v; })} />}
                </>}
                {a.kind === 'taxable' && <Num label="Municipal share of bond income" percent value={a.municipalShare ?? 0} onChange={(v) => set((x) => { x.municipalShare = Math.max(0, Math.min(1, v)) || undefined; })} />}
                {a.kind === 'taxable' && <Check label="Pay dividends and interest out to cash (not reinvested)" value={!!a.dividendsPaidOut} onChange={(v) => set((x) => { x.dividendsPaidOut = v; })} />}
                {a.kind === 'taxable' && <Num label="Foreign tax withheld on dividends" percent value={a.foreignWithholding ?? 0} hint="The share of this account's dividends a foreign country withholds; it counts toward the US foreign tax credit." onChange={(v) => set((x) => { x.foreignWithholding = v || undefined; })} />}
                {a.kind === 'asset' && <>
                  <Check label="Real estate (property tax, deductible mortgage interest)" value={!!a.realEstate} onChange={(v) => set((x) => { x.realEstate = v; })} />
                  {!a.realEstate && <Check label="A collectible (coins, cards, plush toys, art)" value={!!a.collectible} onChange={(v) => set((x) => { x.collectible = v || undefined; })} />}
                  <Num label="Yearly appreciation" percent value={a.appreciation ?? 0.03} onChange={(v) => set((x) => { x.appreciation = v; })} />
                  <Num label="Yearly rent, if rented (today's $)" value={a.rent ?? 0} onChange={(v) => set((x) => { x.rent = v || undefined; })} />
                  {!!a.rent && <Num label="Vacancy" percent value={a.vacancy ?? 0.05} onChange={(v) => set((x) => { x.vacancy = v; })} />}
                  {!!a.rent && <Num label="Rental costs (share of rent)" percent value={a.rentalCosts ?? 0.35} onChange={(v) => set((x) => { x.rentalCosts = v; })} />}
                  <Num label="Sale year (0 for none)" value={a.saleYear ?? 0} onChange={(v) => set((x) => { x.saleYear = v || undefined; })} />
                  <Num label="Cost basis: price paid plus improvements (0 for none)" step={1000} value={a.costBasis ?? 0} hint="With a basis, a sale's gain is taxed as a long-term gain. With none, the sale is taken as made at cost." onChange={(v) => set((x) => { x.costBasis = v || undefined; })} />
                  <Num label="Selling costs (share of the price)" percent value={a.sellingCosts ?? 0} onChange={(v) => set((x) => { x.sellingCosts = v || undefined; })} />
                  {a.realEstate && <Check label="The home you live in (its sale excludes $250,000 of gain a person)" value={!!a.primaryResidence} onChange={(v) => set((x) => { x.primaryResidence = v || undefined; })} />}
                </>}
                {a.kind === 'debt' && <>
                  <Check label="Paid in full every month (a card)" value={!!a.paidInFull} onChange={(v) => set((x) => { x.paidInFull = v || undefined; if (v) { x.balance = 0; x.interestRate = undefined; x.payment = undefined; } })} />
                  {!a.paidInFull && <>
                  <Num label="Interest rate" percent value={a.interestRate ?? 0} onChange={(v) => set((x) => { x.interestRate = v; })} />
                  <Num label="Credit limit (a HELOC or credit line)" value={a.creditLimit ?? 0} onChange={(v) => set((x) => { x.creditLimit = v > 0 ? v : undefined; })} />
                  <Num label="Yearly payment" value={a.payment ?? 0} onChange={(v) => set((x) => { x.payment = v; })} />
                  <Num label="Extra payment a year (today's $)" value={a.extraPayment ?? 0} onChange={(v) => set((x) => { x.extraPayment = v; })} />
                  <Num label="Forgiven in year (0 for none)" value={a.forgiveYear ?? 0} onChange={(v) => set((x) => { x.forgiveYear = v || undefined; })} />
                  </>}
                  <Num label="Annual fee" value={a.annualFee ?? 0} onChange={(v) => set((x) => { x.annualFee = v || undefined; })} />
                  <RatesEditor rates={a.rewards} onChange={(r) => set((x) => { x.rewards = r.length ? r : undefined; })} />
                  {!a.rewards?.length && <>
                    <Num label="Share of spending on this card" percent value={a.cardSpendShare ?? 0} onChange={(v) => set((x) => { x.cardSpendShare = v || undefined; })} />
                    <Num label="Cash back" percent value={a.cashBackRate ?? 0} onChange={(v) => set((x) => { x.cashBackRate = v || undefined; })} />
                  </>}
                  <PayoffYear id={a.id} />
                  <Select label="Secured by" value={a.securedBy ?? ''} options={[['', 'Nothing'], ...assets]} onChange={(v) => set((x) => { x.securedBy = v || undefined; })} />
                </>}
              </>
            );
          }}
        />
      </Card>
    </>
  );
}

export function IncomePage() {
  const plan = useActivePlan();
  const update = useUpdate();
  // Social Security and SSDI chosen as an income's type: the income becomes the person's benefit (Social Security page),
  // its yearly amount the monthly benefit, so every benefit runs through one set of claiming and disability rules
  const toSocialSecurity = (i: number, ssdi: boolean) => update((p) => {
    const inc = p.incomes[i];
    let ss = p.socialSecurity.find((x) => x.ownerId === inc.ownerId);
    if (!ss) { ss = { ownerId: inc.ownerId, pia: Math.round(inc.amount / 12) || 2000, claimAge: 67 }; p.socialSecurity.push(ss); }
    else if (inc.amount) ss.pia = Math.round(inc.amount / 12);
    ss.ssdi = ssdi || undefined;
    if (ssdi) ss.ssdiOnset ??= inc.startYear + '-01-01';
    p.incomes.splice(i, 1);
  });
  const owner = plan.people.map((p) => [p.id, p.name] as [string, string]);
  return (
    <>
      <Card title="Income">
        <ListEditor<Income>
          items={plan.incomes}
          title={(x) => `${x.name} · ${money(x.amount)}/yr from ${x.startYear}${x.endYear ? ' to ' + x.endYear : ''}`}
          empty="Add salaries, pensions, rental income, and other income."
          onAdd={() => update((p) => { p.incomes.push({ id: 'i' + uid(), name: 'New income', kind: 'salary', ownerId: p.people[0].id, amount: 50000, growth: 0, startYear: p.startYear, inflationAdjusted: true, taxable: true }); })}
          onRemove={(i) => update((p) => { p.incomes.splice(i, 1); })}
          render={(x, i) => {
            const set = (fn: (v: Income) => void) => update((p) => fn(p.incomes[i]));
            return (
              <>
                <Text label="Name" value={x.name} onChange={(v) => set((y) => { y.name = v; })} />
                <CurrencySelect value={x.currency} onChange={(v) => set((y) => { y.currency = v; })} />
                <Num label="Foreign income tax paid on it" percent value={x.foreignTaxRate ?? 0} hint="Income tax a foreign country takes from this income, as a share of it. A US taxpayer gets the foreign tax credit for it." onChange={(v) => set((y) => { y.foreignTaxRate = v || undefined; })} />
                {(x.kind === 'salary' || x.kind === 'selfEmployment') && <Check label="Earned while living abroad (a US person)" value={!!x.abroad} onChange={(v) => set((y) => { y.abroad = v || undefined; })} />}
                {x.kind === 'salary' && x.abroad && <Check label="US Social Security and Medicare tax still applies (a US employer)" value={!!x.usPayroll} onChange={(v) => set((y) => { y.usPayroll = v || undefined; })} />}
                <Select label="Type" value={x.kind} options={INCOME_KINDS} onChange={(v) => { if (v === 'socialSecurity' || v === 'ssdi') { toSocialSecurity(i, v === 'ssdi'); return; } set((y) => { y.kind = v; if (v === 'accountBonus') { y.bonusSource ??= 'bank'; y.taxable = true; } if (v === 'settlement') y.taxable = true; }); }} />
                {x.kind === 'accountBonus' && <>
                  <Select label="Bonus from" value={x.bonusSource ?? 'bank'} options={BONUS_SOURCES} onChange={(v) => set((y) => { y.bonusSource = v; y.taxable = v !== 'card'; })} />
                  <Text label="Requirement" value={x.requirement ?? ''} onChange={(v) => set((y) => { y.requirement = v || undefined; })} />
                </>}
                <Select label="Owner" value={x.ownerId} options={owner} onChange={(v) => set((y) => { y.ownerId = v; })} />
                <Num label={x.nominal ? 'Yearly amount (start year\'s $)' : "Yearly amount (today's $)"} value={x.amount} onChange={(v) => set((y) => { y.amount = v; })} />
                <Num label="Real growth a year" percent value={x.growth} onChange={(v) => set((y) => { y.growth = v; })} />
                <WhenField label="Starts" value={x.start} year={x.startYear} onChange={(r) => set((y) => { y.start = r; })} onYear={(v) => set((y) => { y.startYear = v ?? y.startYear; })} />
                <WhenField label="Ends" value={x.end} year={x.endYear} defaultLabel={x.kind === 'salary' || x.kind === 'selfEmployment' ? 'At retirement' : 'For life'} onChange={(r) => set((y) => { y.end = r; })} onYear={(v) => set((y) => { y.endYear = v; })} />
                {x.kind === 'salary' && <>
                  <Num label="Keeps pace with inflation from year (0: from the start)" value={x.indexFrom ?? 0} onChange={(v) => set((y) => { y.indexFrom = v || undefined; })} />
                  <Num label="Paychecks a year" value={x.paychecks ?? 26} onChange={(v) => set((y) => { y.paychecks = Math.max(1, Math.round(v)); })} />
                  <MitPreset onApply={(g, pl, t) => set((y) => { Object.assign(y, applyMit(y, g, pl, t)); })} />
                  <Num label="Employer HSA deposit a year" value={x.employerHsa ?? 0} onChange={(v) => set((y) => { y.employerHsa = v > 0 ? v : undefined; })} />
                  <DeductionsEditor list={x.deductions} onChange={(d) => set((y) => { y.deductions = d.length ? d : undefined; })} />
                </>}
                <Check label="Keeps pace with inflation" value={x.inflationAdjusted} onChange={(v) => set((y) => { y.inflationAdjusted = v; })} />
                <Check label="Taxable" value={x.taxable} onChange={(v) => set((y) => { y.taxable = v; })} />
                <Check label="Amounts in future dollars of their year" value={!!x.nominal} onChange={(v) => set((y) => { y.nominal = v; })} />
                {x.kind === 'selfEmployment' && <Check label="A specified service business (law, health, consulting...)" value={!!x.serviceBusiness} onChange={(v) => set((y) => { y.serviceBusiness = v; })} />}
                {x.kind === 'selfEmployment' && <>
                  <Num label="Health insurance premium a year (today's $)" step={500} value={x.healthPremium ?? 0} hint="The self-employed health insurance deduction, up to the business's profit." onChange={(v) => set((y) => { y.healthPremium = v || undefined; })} />
                  <Select label="Defer as" value={x.contributionAmount !== undefined ? 'amount' : 'share'} options={[['share', 'Share of profit'], ['amount', 'Amount a year']]} onChange={(v) => set((y) => { if (v === 'amount') y.contributionAmount = Math.round((y.contributionRate ?? 0.1) * y.amount); else y.contributionAmount = undefined; })} />
                  {x.contributionAmount !== undefined
                    ? <Num label="Solo 401(k) deferral a year (today's $)" value={x.contributionAmount} onChange={(v) => set((y) => { y.contributionAmount = Math.max(0, v); })} />
                    : <Num label="Solo 401(k) deferral (share of profit)" percent value={x.contributionRate ?? 0} onChange={(v) => set((y) => { y.contributionRate = v; })} />}
                  <Num label="Employer contribution: SEP IRA or solo 401(k)" percent value={x.employerContributionRate ?? 0} hint="A share of net earnings, at most 20% for a sole owner." onChange={(v) => set((y) => { y.employerContributionRate = Math.min(0.2, v) || undefined; })} />
                </>}
                {x.kind !== 'windfall' && <StepsEditor steps={x.steps} nominal={x.nominal} onChange={(st) => set((y) => { y.steps = st; })} />}
                {x.kind === 'options' && <>
                  <Select label="Option type" value={x.options?.type ?? 'nso'} options={[['nso', 'Non-qualified (NSO)'], ['iso', 'Incentive (ISO)']]} onChange={(v) => set((y) => { y.options = { ...(y.options ?? { type: 'nso' as const, shares: 0, strike: 0, price: 0, growth: 0.07 }), type: v }; y.endYear = y.startYear; })} />
                  <Num label="Shares" value={x.options?.shares ?? 0} onChange={(v) => set((y) => { y.options = { ...(y.options ?? { type: 'nso' as const, shares: 0, strike: 0, price: 0, growth: 0.07 }), shares: v }; y.endYear = y.startYear; })} />
                  <Num label="Strike price" value={x.options?.strike ?? 0} onChange={(v) => set((y) => { y.options = { ...(y.options ?? { type: 'nso' as const, shares: 0, strike: 0, price: 0, growth: 0.07 }), strike: v }; })} />
                  <Num label="Share price today" value={x.options?.price ?? 0} onChange={(v) => set((y) => { y.options = { ...(y.options ?? { type: 'nso' as const, shares: 0, strike: 0, price: 0, growth: 0.07 }), price: v }; })} />
                  <Num label="Share price growth a year" percent value={x.options?.growth ?? 0.07} onChange={(v) => set((y) => { y.options = { ...(y.options ?? { type: 'nso' as const, shares: 0, strike: 0, price: 0, growth: 0.07 }), growth: v }; })} />
                </>}
                {x.kind === 'rsu' && <Num label="Vests over (years)" value={x.vestYears ?? 4} onChange={(v) => set((y) => { y.vestYears = v; })} />}
                {x.kind === 'rsu' && <Num label="Cliff (years before the first vesting)" value={x.vestCliffYears ?? 0} hint="With a one-year cliff, nothing vests in the first year and two parts vest in the second." onChange={(v) => set((y) => { y.vestCliffYears = v || undefined; })} />}
                {x.kind === 'salary' && <>
                  <Select label="Contribute as" value={x.contributionAmount !== undefined ? 'amount' : 'share'} options={[['share', 'Share of pay'], ['amount', 'Amount a year']]} onChange={(v) => set((y) => { if (v === 'amount') y.contributionAmount = Math.round((y.contributionRate ?? 0.06) * y.amount); else y.contributionAmount = undefined; })} />
                  {x.contributionAmount !== undefined
                    ? <Num label="401(k) contribution a year (today's $)" value={x.contributionAmount} onChange={(v) => set((y) => { y.contributionAmount = Math.max(0, v); })} />
                    : <Num label="401(k) contribution" percent value={x.contributionRate ?? 0} onChange={(v) => set((y) => { y.contributionRate = v; })} />}
                  <Num label="Share of the contribution going to Roth" percent value={x.contributionRothShare ?? (x.contributionRoth ? 1 : 0)} onChange={(v) => set((y) => { y.contributionRothShare = Math.max(0, Math.min(1, v)); y.contributionRoth = v >= 1; })} />
                  <Num label="Yearly bonus (share of salary)" percent value={x.bonusRate ?? 0} onChange={(v) => set((y) => { y.bonusRate = v || undefined; })} />
                  <Num label="Employer match rate" percent value={x.employerMatch ?? 0} onChange={(v) => set((y) => { y.employerMatch = v; })} />
                  <Num label="Match up to (share of pay)" percent value={x.matchLimit ?? 0} onChange={(v) => set((y) => { y.matchLimit = v; })} />
                </>}
              </>
            );
          }}
        />
      </Card>
      <Card title="Social Security">
        {plan.people.map((person) => {
          const i = plan.socialSecurity.findIndex((s) => s.ownerId === person.id);
          const ss = plan.socialSecurity[i];
          if (!ss) return (
            <button key={person.id} onClick={() => update((p) => { p.socialSecurity.push({ ownerId: person.id, pia: 2000, claimAge: 67 }); })}>+ Social Security for {person.name}</button>
          );
          return (
            <div key={person.id} className="grid">
              <strong className="span">{person.name}</strong>
              <Num label="Benefit at 67, monthly" value={ss.pia} onChange={(v) => update((p) => { p.socialSecurity[i].pia = v; })} />
              <Select label="Benefit" value={ss.ssdi ? 'ssdi' : 'retirement'} options={[['retirement', 'Retirement'], ['ssdi', 'Disability (SSDI)']]} onChange={(v) => update((p) => { p.socialSecurity[i].ssdi = v === 'ssdi' || undefined; if (v === 'ssdi') p.socialSecurity[i].ssdiOnset ??= p.startYear + '-01-01'; })} />
              {ss.ssdi
                ? <label className="field"><span>Disability onset date</span><div className="input"><input type="date" value={ss.ssdiOnset ?? ''} onChange={(e) => update((p) => { p.socialSecurity[i].ssdiOnset = e.target.value || undefined; })} /></div></label>
                : <Num label="Claim age (62 to 70)" value={ss.claimAge} step={1} onChange={(v) => update((p) => { p.socialSecurity[i].claimAge = Math.min(70, Math.max(62, v)); })} />}
              <div className="field"><span>Monthly at that age</span><div className="readout">{money(benefitAtClaim(ss.pia, ss.claimAge))}</div></div>
              <div className="field"><span>No statement at hand?</span>
                <button className="ghost" onClick={() => update((p) => {
                  const sal = p.incomes.filter((x) => x.ownerId === person.id && (x.kind === 'salary' || x.kind === 'selfEmployment')).reduce((t, x) => t + x.amount, 0);
                  const years = (p.strategy.retirementAge[person.id] ?? 65) - 22;
                  p.socialSecurity[i].pia = Math.round(estimatePia(sal, years));
                })}>Estimate from salary</button></div>
            </div>
          );
        })}
      </Card>
    </>
  );
}

/** The add-expense tiles: a type, a starting name, an amount a year (0: entered by the user), and what it covers. */
const ADD_TILES: [ExpenseKind, string, number, string][] = [
  ['living', 'Living expenses', 0, 'Groceries, bills, and everyday costs'], ['housing', 'Rent', 0, 'Rent for the home you live in'],
  ['transportation', 'Transportation', 0, 'Gas, transit, and getting around'], ['insurance', 'Insurance', 0, 'Life, disability, and umbrella policies'],
  ['homeProjects', 'Home projects', 0, 'Renovations, repairs, and upgrades'], ['pets', 'Pets', 0, 'Food, vet visits, and pet care'],
  ['oneTime', 'Emergency', 0, 'An unexpected one-time cost'], ['healthcare', 'Healthcare', 0, 'Premiums, copays, and prescriptions'],
  ['childcare', 'Childcare', 0, 'Daycare and care while you work'], ['education', 'Education', 0, 'Tuition, books, and fees'],
  ['travel', 'Travel', 0, 'Trips and vacations'], ['other', 'Other', 0, 'Anything else'],
];

export function ExpensesPage() {
  const plan = useActivePlan();
  const update = useUpdate();
  const funds = [['', 'Cash flow'], ...plan.accounts.filter((a) => a.kind === 'college529').map((a) => [a.id, a.name])] as [string, string][];
  const { proj } = useProjection();
  const add = (kind: ExpenseKind, name: string, amount: number) => update((p) => { p.expenses.push({ id: 'e' + uid(), name, kind, amount, startYear: p.startYear, growth: 0 }); });
  // the year's spending, the first retirement year's, the plan's total, and what is left at the end
  const first = proj.years[0];
  const retireYear = Math.min(...plan.people.map((q) => q.birthYear + (plan.strategy.retirementAge[q.id] ?? 65)));
  const inRetirement = proj.years.find((y) => y.year === retireYear);
  const lifetime = proj.years.reduce((t, y) => t + y.totalExpenses, 0);
  const last = proj.years[proj.years.length - 1];
  return (
    <>
    <div className="stats">
      <Stat icon="trend" label="Spending this year" value={money(first?.totalExpenses ?? 0)} />
      <Stat icon="trend" label="In retirement" value={money(inRetirement?.totalExpenses ?? 0)} sub={'a year, from ' + retireYear} />
      <Stat icon="trend" label="Lifetime" value={money(lifetime, true)} />
      <Stat icon="trend" label="Legacy" value={money(last?.netWorth ?? 0, true)} sub={last ? 'at the end, ' + last.year : ''} />
    </div>
    <Card title="Add an expense">
      <div className="tiles">
        {ADD_TILES.map(([kind, name, amount, sub]) => (
          <button key={name} className="tile" onClick={() => add(kind, name, amount)}><b>{name}</b><small>{sub}</small></button>
        ))}
      </div>
    </Card>
    <Card title="Expenses">
      <ListEditor<Expense>
        items={plan.expenses}
        title={(x) => `${x.name} · ${money(x.amount)}${x.kind === 'oneTime' ? ' once in ' + x.startYear : '/yr'}`}
        empty="Add living expenses, healthcare, travel, and one-time costs."
        onAdd={() => update((p) => { p.expenses.push({ id: 'e' + uid(), name: 'New expense', kind: 'other', amount: 5000, startYear: p.startYear, growth: 0 }); })}
        onRemove={(i) => update((p) => { p.expenses.splice(i, 1); })}
        render={(x, i) => {
          const set = (fn: (v: Expense) => void) => update((p) => fn(p.expenses[i]));
          return (
            <>
              <Text label="Name" value={x.name} onChange={(v) => set((y) => { y.name = v; })} />
              <CurrencySelect value={x.currency} onChange={(v) => set((y) => { y.currency = v; })} />
              {x.kind === 'healthcare' && <Check label="Bills paid through a health plan" value={!!x.coverage} onChange={(v) => set((y) => { y.coverage = v ? { deductible: 1700, coinsurance: 0.2, oopMax: 5000 } : undefined; })} />}
              {x.kind === 'healthcare' && x.coverage && <>
                <Num label="Deductible" value={x.coverage.deductible} onChange={(v) => set((y) => { y.coverage = { ...y.coverage!, deductible: v }; })} />
                <Num label="Coinsurance after the deductible" percent value={x.coverage.coinsurance} onChange={(v) => set((y) => { y.coverage = { ...y.coverage!, coinsurance: v }; })} />
                <Num label="Out-of-pocket maximum" value={x.coverage.oopMax} onChange={(v) => set((y) => { y.coverage = { ...y.coverage!, oopMax: v }; })} />
              </>}
              <Check label="Shared cost: grows with the household" value={!!x.scalesWithHousehold} onChange={(v) => set((y) => { y.scalesWithHousehold = v || undefined; })} />
              <Select label="Spender" value={x.spender ?? ''} options={[['', 'Household'], ...plan.people.map((q) => [q.id, q.name] as [string, string])]} onChange={(v) => set((y) => { y.spender = v || undefined; })} />
              {x.kind !== 'oneTime' && <Num label="Repeats every (years)" value={x.everyYears ?? 1} onChange={(v) => set((y) => { y.everyYears = Math.round(v) > 1 ? Math.round(v) : undefined; })} />}
              <Num label="Discretionary share" percent value={x.discretionary ?? 0} hint="The part which could be cut in a bad stretch. Flexible spending (Strategy) uses it." onChange={(v) => set((y) => { y.discretionary = Math.max(0, Math.min(1, v)) || undefined; })} />
              <Num label="As a share of income (0: a fixed amount)" percent value={x.incomeShare ?? 0} onChange={(v) => set((y) => { y.incomeShare = v || undefined; })} />
              {!!x.incomeShare && <Select label="Share of" value={x.incomeBasis ?? 'pay'} options={[['pay', 'Pay'], ['all', 'All income']]} onChange={(v) => set((y) => { y.incomeBasis = v; })} />}
              <Select label="Card spending category" value={categoryOf(x)} options={SPEND_CATEGORIES.map(([k, l]) => [k, l] as [SpendCategory, string])} onChange={(v) => set((y) => { y.spendCategory = v; })} />
              <PaidByEditor list={x.paidBy} start={x.startYear} onChange={(l) => set((y) => { y.paidBy = l.length ? l : undefined; })} />
              <Num label="Paid back to you" percent value={x.reimbursedShare ?? 0} onChange={(v) => set((y) => { y.reimbursedShare = v ? Math.min(1, v) : undefined; })} />
              {!!x.reimbursedShare && <Num label="Paid back after (years; 0 the same year)" value={x.reimbursedAfterYears ?? 0} onChange={(v) => set((y) => { y.reimbursedAfterYears = Math.max(0, v); })} />}
              {(x.kind === 'healthcare' || x.kind === 'childcare') && <Check label="Paid through a workplace FSA" value={!!x.fsa} onChange={(v) => set((y) => { y.fsa = v || undefined; })} />}
              <Select label="Type" value={x.kind} options={EXPENSE_KINDS} onChange={(v) => set((y) => { y.kind = v; })} />
              <Num label={(x.kind === 'oneTime' ? 'Amount' : 'Yearly amount') + (x.nominal ? " (that year's $)" : " (today's $)")} value={x.amount} onChange={(v) => set((y) => { y.amount = v; })} />
              <WhenField label={x.kind === 'oneTime' ? 'When' : 'Starts'} value={x.start} year={x.startYear} onChange={(r) => set((y) => { y.start = r; })} onYear={(v) => set((y) => { y.startYear = v ?? y.startYear; })} />
              {x.kind !== 'oneTime' && <WhenField label="Ends" value={x.end} year={x.endYear} defaultLabel="For life" onChange={(r) => set((y) => { y.end = r; })} onYear={(v) => set((y) => { y.endYear = v; })} />}
              <Num label="Growth above inflation" percent value={x.growth} onChange={(v) => set((y) => { y.growth = v; })} />
              <Check label="Amounts in future dollars of their year" value={!!x.nominal} onChange={(v) => set((y) => { y.nominal = v; })} />
              {x.kind !== 'oneTime' && <StepsEditor steps={x.steps} nominal={x.nominal} onChange={(st) => set((y) => { y.steps = st; })} />}
              {x.kind === 'education' && <Select label="Paid from" value={x.fundedBy ?? ''} options={funds} onChange={(v) => set((y) => { y.fundedBy = v || undefined; })} />}
            </>
          );
        }}
      />
    </Card>
    </>
  );
}

const EVENT_KINDS: [LifeEvent['kind'], string][] = [['wedding', 'Wedding'], ['birth', 'Pregnancy and birth'], ['adoption', 'Adoption'], ['homePurchase', 'Buy a home'], ['rentalProperty', 'Buy a rental property'], ['child', 'Have a child'], ['careerBreak', 'Career break'], ['payChange', 'Pay change'], ['move', 'Move to another state'], ['inheritance', 'Inheritance'], ['annuity', 'Buy an annuity'], ['recurring', 'Recurring purchase'], ['separation', 'Separation or divorce']];

function newEvent(kind: LifeEvent['kind'], year: number, personId: string): LifeEvent {
  const id = uid();
  if (kind === 'homePurchase') return { id, kind, name: 'New home', year, price: 600000, downPayment: 0.2, rate: 0.065, termYears: 30, appreciation: 0.03, closingCosts: 0.03 };
  if (kind === 'child') return { id, kind, name: 'Child', year, yearlyCost: 15000, collegeYearly: 30000, collegeYears: 4 };
  if (kind === 'wedding') return { id, kind, name: 'Wedding', year, style: 'midsize', guests: 0, days: 1, locations: 1, destination: 'home' };
  if (kind === 'birth') return { id, kind, name: 'Baby', year, cover: 'employer', cesarean: false, yearlyCost: 0, collegeYearly: 0, collegeYears: 4 };
  if (kind === 'adoption') return { id, kind, name: 'Adoption', year, route: 'foster', yearlyCost: 0, collegeYearly: 0, collegeYears: 4 };
  if (kind === 'careerBreak') return { id, kind, name: 'Career break', personId, year, endYear: year + 1 };
  if (kind === 'payChange') return { id, kind, name: 'Promotion', personId, year, factor: 1.2 };
  if (kind === 'move') return { id, kind, name: 'Move', year, state: 'TX' };
  if (kind === 'inheritance') return { id, kind, name: 'Inheritance', year, amount: 200000, asIra: false };
  if (kind === 'annuity') return { id, kind, name: 'Income annuity', year, premium: 0, payoutRate: 0.07, payoutYear: year, personId };
  if (kind === 'separation') return { id, kind, name: 'Separation', year, personId, keepShare: 0.5, expenseFactor: 0.65, support: 0, supportYears: 0 };
  if (kind === 'recurring') return { id, kind, name: 'New car', year, amount: 40000, everyYears: 8, endYear: year + 40 };
  return { id, kind: 'rentalProperty', name: 'Rental', year, price: 350000, downPayment: 0.25, rate: 0.07, termYears: 30, rent: 30000, vacancy: 0.05, costs: 0.35, appreciation: 0.03 };
}

export function EventsPage() {
  const plan = useActivePlan();
  const update = useUpdate();
  const events = plan.events ?? [];
  const people = plan.people.map((p) => [p.id, p.name] as [string, string]);
  const label = (e: LifeEvent) => EVENT_KINDS.find((k) => k[0] === e.kind)?.[1];
  return (
    <Card title="Life events">
      <ListEditor<LifeEvent>
        items={events}
        title={(e) => `${e.year} · ${e.name} (${label(e)})`}
        empty="Add a home purchase, a child, a career break, or a pay change."
        onAdd={() => update((p) => { (p.events ??= []).push(newEvent('homePurchase', p.startYear + 3, p.people[0].id)); })}
        onRemove={(i) => update((p) => { p.events!.splice(i, 1); })}
        render={(e, i) => {
          const set = (fn: (x: LifeEvent) => void) => update((p) => fn(p.events![i]));
          return (
            <>
              <Select label="Event" value={e.kind} options={EVENT_KINDS} onChange={(v) => update((p) => { p.events![i] = { ...newEvent(v, e.year, p.people[0].id), id: e.id }; })} />
              <Text label="Name" value={e.name} onChange={(v) => set((x) => { x.name = v; })} />
              <label className="field"><span>Date</span><div className="input"><input type="date" value={e.date ?? e.year + '-01-01'} onChange={(ev) => { const d = ev.target.value; if (d) set((x) => { x.date = d; x.year = Number(d.slice(0, 4)); }); }} /></div></label>
              {'endYear' in e && <label className="field"><span>End date</span><div className="input"><input type="date" value={e.endDate ?? ''} onChange={(ev) => set((x) => { x.endDate = ev.target.value || undefined; if (ev.target.value && 'endYear' in x) (x as { endYear: number }).endYear = Number(ev.target.value.slice(0, 4)); })} /></div></label>}
              {e.kind === 'homePurchase' && <>
                <Num label="Price (today's $)" value={e.price} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.price = v; })} />
                <Num label="Down payment" percent value={e.downPayment} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.downPayment = v; })} />
                <Num label="Closing costs" percent value={e.closingCosts} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.closingCosts = v; })} />
                <Num label="Mortgage rate" percent value={e.rate} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.rate = v; })} />
                <Num label="Term (years)" value={e.termYears} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.termYears = v; })} />
                <Num label="Yearly appreciation" percent value={e.appreciation} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.appreciation = v; })} />
              </>}
              {e.kind === 'wedding' && <>
                <Select label="Style" value={e.style} options={WEDDING_STYLES} onChange={(v) => set((x) => { if (x.kind === 'wedding') x.style = v; })} />
                <Num label="Guests (0: the average for the style)" value={e.guests} onChange={(v) => set((x) => { if (x.kind === 'wedding') x.guests = Math.max(0, Math.round(v)); })} />
                <Num label="Days" value={e.days} onChange={(v) => set((x) => { if (x.kind === 'wedding') x.days = Math.max(1, Math.round(v)); })} />
                <Num label="Locations" value={e.locations} onChange={(v) => set((x) => { if (x.kind === 'wedding') x.locations = Math.max(1, Math.round(v)); })} />
                <Select label="Where" value={e.destination} options={[['home', 'Near home'], ['domestic', 'A destination in the US'], ['international', 'Abroad']]} onChange={(v) => set((x) => { if (x.kind === 'wedding') x.destination = v; })} />
                <Num label="Cost (0: the estimate)" value={e.cost ?? 0} hint={WEDDING_SOURCES.join(' ')} onChange={(v) => set((x) => { if (x.kind === 'wedding') x.cost = v || undefined; })} />
                <div className="field"><span>Estimate</span><div className="muted">{money(weddingCost(e))}</div></div>
              </>}
              {e.kind === 'birth' && <>
                <Select label="Coverage" value={e.cover} options={[['employer', 'Employer or marketplace insurance'], ['medicaid', 'Medicaid'], ['uninsured', 'No insurance']]} onChange={(v) => set((x) => { if (x.kind === 'birth') x.cover = v; })} />
                <Check label="Cesarean" value={e.cesarean} onChange={(v) => set((x) => { if (x.kind === 'birth') x.cesarean = v; })} />
                <Num label="Cost (0: the estimate)" value={e.cost ?? 0} hint={BIRTH_SOURCE} onChange={(v) => set((x) => { if (x.kind === 'birth') x.cost = v || undefined; })} />
                <div className="field"><span>Estimate</span><div className="muted">{money(birthCost(e.cover, e.cesarean))} out of pocket</div></div>
              </>}
              {e.kind === 'adoption' && <>
                <Select label="Route" value={e.route} options={ADOPTION_ROUTES} onChange={(v) => set((x) => { if (x.kind === 'adoption') x.route = v; })} />
                <Num label="Cost (0: the estimate)" value={e.cost ?? 0} hint={ADOPTION_SOURCE} onChange={(v) => set((x) => { if (x.kind === 'adoption') x.cost = v || undefined; })} />
                <div className="field"><span>Estimate</span><div className="muted">{money(adoptionCost(e.route))}</div></div>
              </>}
              {(e.kind === 'child' || e.kind === 'birth' || e.kind === 'adoption') && <>
                <Num label="Yearly cost to 18 (today's $)" value={e.yearlyCost} onChange={(v) => set((x) => { if (x.kind === 'child' || x.kind === 'birth' || x.kind === 'adoption') x.yearlyCost = v; })} />
                <Num label="College a year (today's $)" value={e.collegeYearly} onChange={(v) => set((x) => { if (x.kind === 'child' || x.kind === 'birth' || x.kind === 'adoption') x.collegeYearly = v; })} />
                <Num label="College years" value={e.collegeYears} onChange={(v) => set((x) => { if (x.kind === 'child' || x.kind === 'birth' || x.kind === 'adoption') x.collegeYears = v; })} />
              </>}
              {(e.kind === 'careerBreak' || e.kind === 'payChange') && (
                <Select label="Person" value={e.personId} options={people} onChange={(v) => set((x) => { if (x.kind === 'careerBreak' || x.kind === 'payChange') x.personId = v; })} />
              )}
              {e.kind === 'rentalProperty' && <>
                <Num label="Price (today's $)" value={e.price} onChange={(v) => set((x) => { if (x.kind === 'rentalProperty') x.price = v; })} />
                <Num label="Down payment" percent value={e.downPayment} onChange={(v) => set((x) => { if (x.kind === 'rentalProperty') x.downPayment = v; })} />
                <Num label="Mortgage rate" percent value={e.rate} onChange={(v) => set((x) => { if (x.kind === 'rentalProperty') x.rate = v; })} />
                <Num label="Term (years)" value={e.termYears} onChange={(v) => set((x) => { if (x.kind === 'rentalProperty') x.termYears = v; })} />
                <Num label="Yearly rent (today's $)" value={e.rent} onChange={(v) => set((x) => { if (x.kind === 'rentalProperty') x.rent = v; })} />
                <Num label="Vacancy" percent value={e.vacancy} onChange={(v) => set((x) => { if (x.kind === 'rentalProperty') x.vacancy = v; })} />
                <Num label="Costs (share of rent)" percent value={e.costs} onChange={(v) => set((x) => { if (x.kind === 'rentalProperty') x.costs = v; })} />
                <Num label="Yearly appreciation" percent value={e.appreciation} onChange={(v) => set((x) => { if (x.kind === 'rentalProperty') x.appreciation = v; })} />
              </>}
              {e.kind === 'move' && <>
                <Select label="New state" value={e.state} options={Object.keys(statesJson).sort().map((k) => [k, k] as [string, string])} onChange={(v) => set((x) => { if (x.kind === 'move') x.state = v; })} />
                <div className="span"><LocalTaxFields value={e.local} onChange={(v) => set((x) => { if (x.kind === 'move') x.local = v; })} /></div>
              </>}
              {e.kind === 'inheritance' && <>
                <Num label="Amount (today's $)" value={e.amount} onChange={(v) => set((x) => { if (x.kind === 'inheritance') x.amount = v; })} />
                <Check label="As an inherited IRA (10-year rule)" value={e.asIra} onChange={(v) => set((x) => { if (x.kind === 'inheritance') x.asIra = v; })} />
              </>}
              {e.kind === 'annuity' && <>
                <Num label="Premium" value={e.premium} onChange={(v) => set((x) => { if (x.kind === 'annuity') x.premium = v; })} />
                <Select label="Paid from" value={e.fromAccount ?? ''} options={[['', 'Cash flow'], ...plan.accounts.filter((q) => q.kind !== 'debt' && q.kind !== 'asset').map((q) => [q.id, q.name] as [string, string])]} onChange={(v) => set((x) => { if (x.kind === 'annuity') x.fromAccount = v || undefined; })} />
                <Num label="Payout a year (share of premium)" percent value={e.payoutRate} onChange={(v) => set((x) => { if (x.kind === 'annuity') x.payoutRate = Math.max(0, v); })} />
                <Num label="Payouts start in" value={e.payoutYear} onChange={(v) => set((x) => { if (x.kind === 'annuity') x.payoutYear = Math.round(v); })} />
                <Select label="Annuitant" value={e.personId} options={plan.people.map((q) => [q.id, q.name] as [string, string])} onChange={(v) => set((x) => { if (x.kind === 'annuity') x.personId = v; })} />
                <Check label="Payout rises with inflation" value={!!e.inflationAdjusted} onChange={(v) => set((x) => { if (x.kind === 'annuity') x.inflationAdjusted = v || undefined; })} />
              </>}
              {e.kind === 'recurring' && <>
                <Num label="Amount (today's $)" value={e.amount} onChange={(v) => set((x) => { if (x.kind === 'recurring') x.amount = v; })} />
                <Num label="Every (years)" value={e.everyYears} onChange={(v) => set((x) => { if (x.kind === 'recurring') x.everyYears = v; })} />
                <Num label="Last year" value={e.endYear} onChange={(v) => set((x) => { if (x.kind === 'recurring') x.endYear = v; })} />
              </>}
              {e.kind === 'separation' && <>
                <Select label="Who leaves the plan" value={e.personId} options={people} onChange={(v) => set((x) => { if (x.kind === 'separation') x.personId = v; })} />
                <Num label="Share of every account kept" percent value={e.keepShare} onChange={(v) => set((x) => { if (x.kind === 'separation') x.keepShare = v; })} />
                <Num label="Expenses from then on (× before)" step={0.05} value={e.expenseFactor} onChange={(v) => set((x) => { if (x.kind === 'separation') x.expenseFactor = v; })} />
                <Num label="Support paid a year (today's $)" value={e.support} onChange={(v) => set((x) => { if (x.kind === 'separation') x.support = v; })} />
                <Num label="Support for (years)" value={e.supportYears} onChange={(v) => set((x) => { if (x.kind === 'separation') x.supportYears = v; })} />
              </>}
              {e.kind === 'payChange' && <Num label="Pay from then on (× current)" step={0.05} value={e.factor} onChange={(v) => set((x) => { if (x.kind === 'payChange') x.factor = v; })} />}
            </>
          );
        }}
      />
    </Card>
  );
}

export function MilestonesPage() {
  const plan = useActivePlan();
  const update = useUpdate();
  return (
    <Card title="Milestones">
      <ListEditor<Milestone>
        items={plan.milestones}
        title={(m) => m.name}
        empty="Add milestones to mark on the charts."
        onAdd={() => update((p) => { p.milestones.push({ id: 'm' + uid(), name: 'New milestone', kind: 'year', year: p.startYear + 10 }); })}
        onRemove={(i) => update((p) => { p.milestones.splice(i, 1); })}
        render={(m, i) => {
          const set = (fn: (v: Milestone) => void) => update((p) => fn(p.milestones[i]));
          return (
            <>
              <Text label="Name" value={m.name} onChange={(v) => set((y) => { y.name = v; })} />
              <Select label="When" value={m.kind} options={[['year', 'A year'], ['age', 'An age'], ['financialIndependence', 'Financial independence'], ['netWorth', 'A net worth'], ['liquidNetWorth', 'Invested assets of an amount'], ['coastFi', 'Coast FI'], ['debtFree', 'Debt-free'], ['all', 'All of several conditions']]} onChange={(v) => set((y) => { y.kind = v; })} />
              {m.kind === 'year' && <Num label="Year" value={m.year} onChange={(v) => set((y) => { y.year = v; })} />}
              {m.kind === 'age' && <>
                <Select label="Person" value={m.personId ?? plan.people[0].id} options={plan.people.map((p) => [p.id, p.name] as [string, string])} onChange={(v) => set((y) => { y.personId = v; })} />
                <Num label="Age" value={m.age} onChange={(v) => set((y) => { y.age = v; })} />
              </>}
              {(m.kind === 'netWorth' || m.kind === 'liquidNetWorth') && <Num label="Amount (today's $)" value={m.netWorth} onChange={(v) => set((y) => { y.netWorth = v; })} />}
              {m.kind === 'all' && <div className="span">
                {(m.conditions ?? []).map((c, j) => (
                  <div key={j} className="row">
                    <Select label="Condition" value={c.kind} options={[['year', 'From a year'], ['age', 'From an age'], ['financialIndependence', 'Once financially independent'], ['netWorth', 'Net worth at least'], ['liquidNetWorth', 'Invested assets at least'], ['coastFi', 'Once at Coast FI'], ['debtFree', 'Once debt-free']]}
                      onChange={(v) => set((y) => { y.conditions![j] = { kind: v, personId: plan.people[0].id }; })} />
                    {c.kind === 'year' && <Num label="Year" value={c.year} onChange={(v) => set((y) => { y.conditions![j].year = v; })} />}
                    {c.kind === 'age' && <>
                      <Select label="Person" value={c.personId ?? plan.people[0].id} options={plan.people.map((p) => [p.id, p.name] as [string, string])} onChange={(v) => set((y) => { y.conditions![j].personId = v; })} />
                      <Num label="Age" value={c.age} onChange={(v) => set((y) => { y.conditions![j].age = v; })} />
                    </>}
                    {(c.kind === 'netWorth' || c.kind === 'liquidNetWorth') && <Num label="Amount (today's $)" value={c.netWorth} onChange={(v) => set((y) => { y.conditions![j].netWorth = v; })} />}
                    <button className="ghost danger" onClick={() => set((y) => { y.conditions!.splice(j, 1); })}>Remove</button>
                  </div>
                ))}
                <button className="ghost" onClick={() => set((y) => { (y.conditions ??= []).push({ kind: 'age', personId: plan.people[0].id, age: 55 }); })}>+ Condition</button>
              </div>}
              <div className="span">
                {plan.people.map((p) => (
                  <Check key={p.id} label={`${p.name} retires when this is reached`} value={(m.retires ?? []).includes(p.id)}
                    onChange={(v) => set((y) => { y.retires = v ? [...(y.retires ?? []), p.id] : (y.retires ?? []).filter((x) => x !== p.id); })} />
                ))}
              </div>
            </>
          );
        }}
      />
    </Card>
  );
}

const STEP_LABEL: Record<WithdrawalStep, string> = { cash: 'Cash', taxable: 'Taxable', traditional: 'Traditional', roth: 'Roth', hsa: 'HSA' };

/** The strategy, whole or one part of it (ProjectionLab's Optimize pages): tax strategy, flexible spending, Roth
 * conversions, drawdown, or gain harvesting. */
export type StrategyFocus = 'tax' | 'flex' | 'roth' | 'drawdown' | 'harvest';
export function StrategyPage({ focus }: { focus?: StrategyFocus } = {}) {
  const show = (...f: StrategyFocus[]) => !focus || f.includes(focus);
  const plan = useActivePlan();
  const update = useUpdate();
  const s = plan.strategy;
  const moveLater = (i: number, d: number) => update((p) => {
    const o = p.strategy.withdrawalOrderLater!.order; const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
  });
  const move = (i: number, d: number) => update((p) => {
    const o = p.strategy.withdrawalOrder; const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
  });
  return (
    <>
      {show('tax') && <Card title="Saving while working">
        <div className="grid">
          <Num label="Cash to keep on hand (today's $)" value={s.cashTarget} onChange={(v) => update((p) => { p.strategy.cashTarget = v; })} />
          <Num label="Traditional IRA a year" value={s.iraContribution} onChange={(v) => update((p) => { p.strategy.iraContribution = v; })} />
          <Num label="Roth IRA a year" value={s.rothIraContribution} onChange={(v) => update((p) => { p.strategy.rothIraContribution = v; })} />
          <Num label="HSA a year" value={s.hsaContribution} onChange={(v) => update((p) => { p.strategy.hsaContribution = v; })} />
          <Check label="Choose Roth or traditional each year" value={!!s.autoRoth} onChange={(v) => update((p) => { p.strategy.autoRoth = v || undefined; })} />
          <Check label="Backdoor Roth (no income limit on the Roth IRA)" value={!!s.backdoorRoth} onChange={(v) => update((p) => { p.strategy.backdoorRoth = v; })} />
          <Num label="Mega backdoor Roth a year" value={s.megaBackdoor ?? 0} onChange={(v) => update((p) => { p.strategy.megaBackdoor = v; })} />
          <Select label="Leftover pay goes to" value={s.surplusTo ?? 'invest'} options={[['invest', 'Investing (taxable account)'], ['debt', 'Paying debts down first']]} onChange={(v) => update((p) => { p.strategy.surplusTo = v; })} />
        </div>
      </Card>}
      {show('drawdown', 'tax', 'flex', 'harvest') && <Card title={focus === 'flex' ? 'Flexible spending' : focus === 'harvest' ? 'Gain harvesting' : 'Withdrawals in retirement'}>
        {show('drawdown') && <><ol className="order">
          {s.withdrawalOrder.map((step, i) => (
            <li key={step}>
              {STEP_LABEL[step]}
              <span>
                <button className="ghost" onClick={() => move(i, -1)}>↑</button>
                <button className="ghost" onClick={() => move(i, 1)}>↓</button>
              </span>
            </li>
          ))}
        </ol>
        <div className="grid">
          <Check label="Change the order from a later year" value={!!s.withdrawalOrderLater} onChange={(v) => update((p) => { p.strategy.withdrawalOrderLater = v ? { year: p.startYear + 20, order: [...p.strategy.withdrawalOrder] } : undefined; })} />
          {s.withdrawalOrderLater && <Select label="Change the order when" value={s.withdrawalOrderLater.milestoneId ?? ''} options={[['', 'A year comes'], ...plan.milestones.map((m) => [m.id, m.name + ' is reached'] as [string, string])]} onChange={(v) => update((p) => { p.strategy.withdrawalOrderLater!.milestoneId = v || undefined; })} />}
          {s.withdrawalOrderLater && !s.withdrawalOrderLater.milestoneId && <Num label="From the year" value={s.withdrawalOrderLater.year} onChange={(v) => update((p) => { p.strategy.withdrawalOrderLater!.year = v; })} />}
        </div>
        {s.withdrawalOrderLater && <ol className="order">
          {s.withdrawalOrderLater.order.map((step, i) => (
            <li key={step}>
              {STEP_LABEL[step]}
              <span>
                <button className="ghost" onClick={() => moveLater(i, -1)}>↑</button>
                <button className="ghost" onClick={() => moveLater(i, 1)}>↓</button>
              </span>
            </li>
          ))}
        </ol>}</>}
        <div className="grid">
          {show('drawdown') && <Select label="How to draw" value={s.withdrawalMethod ?? 'order'} options={[['order', 'In the order above'], ['proportional', 'In proportion to balances']]}
            onChange={(v) => update((p) => { p.strategy.withdrawalMethod = v; })} />}
          {show('tax', 'drawdown') && <Select label="Shield withdrawals under" value={s.shield ?? 'none'} options={[['none', 'No limit'], ['bracket12', 'The 12% bracket'], ['bracket22', 'The 22% bracket'], ['bracket24', 'The 24% bracket'], ['irmaa', 'The first IRMAA tier'], ['aca', 'The ACA credit limit (400% FPL)']]}
            onChange={(v) => update((p) => { p.strategy.shield = v; })} />}
          {show('tax', 'drawdown') && s.shield === 'aca' && <Num label="Keep income under this multiple of the poverty line" value={s.fplMultiple ?? 4} onChange={(v) => update((p) => { p.strategy.fplMultiple = v > 0 ? v : undefined; })} />}
          {show('harvest', 'tax') && <Check label="Realize gains in the 0% capital gains band each year" value={!!s.harvestZeroGains} onChange={(v) => update((p) => { p.strategy.harvestZeroGains = v; })} />}
          {show('drawdown', 'flex') && <Select label="Spending rule" value={s.spending} options={[['expenses', 'The plan\'s expenses'], ['fixedPercent', 'Fixed share of the portfolio'], ['guardrails', 'Guardrails (±10% when the rate drifts 20%)'], ['vpw', 'Variable percentage (spend down by the plan end)'], ['textbook', 'Textbook rule (a share of the first year, then with inflation)'], ['cape', 'CAPE-based (more when stocks are cheap)']]}
            onChange={(v) => update((p) => { p.strategy.spending = v; })} />}
          {show('drawdown', 'flex') && s.spending === 'cape' && <>
            <Num label="CAPE ratio today" value={s.cape?.now ?? 30} onChange={(v) => update((p) => { p.strategy.cape = { ...(p.strategy.cape ?? { now: 30, base: 0.0175, weight: 0.5 }), now: Math.max(1, v) }; })} />
            <Num label="Base withdrawal rate" percent value={s.cape?.base ?? 0.0175} onChange={(v) => update((p) => { p.strategy.cape = { ...(p.strategy.cape ?? { now: 30, base: 0.0175, weight: 0.5 }), base: v }; })} />
            <Num label="Weight on the earnings yield" value={s.cape?.weight ?? 0.5} onChange={(v) => update((p) => { p.strategy.cape = { ...(p.strategy.cape ?? { now: 30, base: 0.0175, weight: 0.5 }), weight: v }; })} />
          </>}
          {(s.spending === 'fixedPercent' || s.spending === 'guardrails' || s.spending === 'textbook') && <Num label="Withdrawal rate" percent value={s.spendingRate} onChange={(v) => update((p) => { p.strategy.spendingRate = v; })} />}
          {show('drawdown') && <Num label="Safe withdrawal rate (FI test)" percent value={s.safeWithdrawalRate} onChange={(v) => update((p) => { p.strategy.safeWithdrawalRate = v; })} />}
          {show('drawdown') && <Check label="Count real assets (home equity) toward FI and net worth milestones" value={!!s.fiCountsRealAssets} onChange={(v) => update((p) => { p.strategy.fiCountsRealAssets = v; })} />}
          {show('flex') && <Check label="Flexible spending: cut discretionary spending in bad stretches" value={!!s.flex?.enabled} onChange={(v) => update((p) => { p.strategy.flex = { drop: 0.2, cut: 0.5, rise: 0.25, boost: 0, ...p.strategy.flex, enabled: v }; })} />}
          {show('flex') && s.flex?.enabled && <>
            <Num label="Cut when the portfolio is under its high by" percent value={s.flex.drop} onChange={(v) => update((p) => { p.strategy.flex!.drop = v; })} />
            <Num label="Share of discretionary spending cut" percent value={s.flex.cut} onChange={(v) => update((p) => { p.strategy.flex!.cut = Math.max(0, Math.min(1, v)); })} />
            <Num label="Raise when the portfolio is above its start by" percent value={s.flex.rise ?? 0.25} onChange={(v) => update((p) => { p.strategy.flex!.rise = v; })} />
            <Num label="Raise of discretionary spending" percent value={s.flex.boost ?? 0} onChange={(v) => update((p) => { p.strategy.flex!.boost = v; })} />
          </>}
          {show('tax') && <Check label="Give to charity from IRAs from 71 (qualified charitable distributions)" value={!!s.qcd} onChange={(v) => update((p) => { p.strategy.qcd = v; })} />}
        </div>
      </Card>}
      <TransfersCard />
      {show('drawdown') && <Card title="Asset allocation over time (glide path)">
        <div className="grid">
          <Check label="Shift from stocks to bonds with age" value={!!s.glidePath?.enabled} onChange={(v) => update((p) => { p.strategy.glidePath = { startAge: 45, endAge: 70, endStocks: 0.5, ...p.strategy.glidePath, enabled: v }; })} />
          {s.glidePath?.enabled && <>
            <Num label="From age" value={s.glidePath.startAge} onChange={(v) => update((p) => { p.strategy.glidePath!.startAge = v; })} />
            <Num label="To age" value={s.glidePath.endAge} onChange={(v) => update((p) => { p.strategy.glidePath!.endAge = v; })} />
            <Num label="Stocks at the end" percent value={s.glidePath.endStocks} onChange={(v) => update((p) => { p.strategy.glidePath!.endStocks = v; })} />
          </>}
        </div>
      </Card>}
      {show('roth', 'tax') && <Card title="Roth conversions">
        <div className="grid">
          <Select label="Fill up to the bracket" value={String(s.rothConversionBracket)} options={[['0', 'No conversions'], ['0.1', '10%'], ['0.12', '12%'], ['0.22', '22%'], ['0.24', '24%'], ['0.32', '32%']]}
            onChange={(v) => update((p) => { p.strategy.rothConversionBracket = Number(v); })} />
          <Num label="From year" value={s.rothConversionStart ?? plan.startYear} onChange={(v) => update((p) => { p.strategy.rothConversionStart = v; })} />
          <Num label="To year" value={s.rothConversionEnd ?? plan.startYear + 30} onChange={(v) => update((p) => { p.strategy.rothConversionEnd = v; })} />
          <Num label="Conversion cap a year (today's $; 0: none)" value={s.rothConversionCap ?? 0} onChange={(v) => update((p) => { p.strategy.rothConversionCap = v || undefined; })} />
        </div>
        <div className="grid" style={{ marginTop: 10 }}>
          {(s.manualConversions ?? []).map((m, i) => (
            <div key={i} className="row">
              <Num label="Convert in year" value={m.year} onChange={(v) => update((p) => { p.strategy.manualConversions![i].year = v; })} />
              <Num label="Amount (today's $)" value={m.amount} onChange={(v) => update((p) => { p.strategy.manualConversions![i].amount = v; })} />
              <button className="ghost danger" onClick={() => update((p) => { p.strategy.manualConversions!.splice(i, 1); })}>Remove</button>
            </div>
          ))}
          <div><button className="ghost" onClick={() => update((p) => { (p.strategy.manualConversions ??= []).push({ year: p.startYear + 5, amount: 50000 }); })}>+ A conversion in a set year</button></div>
        </div>
        <div className="grid" style={{ marginTop: 10 }}>
          <Check label="72(t) SEPP withdrawals before 59½ (no penalty)" value={!!s.sepp?.enabled} onChange={(v) => update((p) => { p.strategy.sepp = { startYear: p.startYear + 10, ...p.strategy.sepp, enabled: v }; })} />
          {s.sepp?.enabled && <Num label="SEPP from year" value={s.sepp.startYear} onChange={(v) => update((p) => { p.strategy.sepp!.startYear = v; })} />}
        </div>
      </Card>}
    </>
  );
}

function TransfersCard() {
  const plan = useActivePlan();
  const update = useUpdate();
  const list = plan.strategy.transfers ?? [];
  const accts = plan.accounts.filter((a) => a.kind !== 'asset').map((a) => [a.id, a.name] as [string, string]);
  const dests: [string, string][] = [...accts, ['external', 'Outside the plan (a gift)']];
  return (
    <Card title="Scheduled transfers between accounts">
      <ListEditor<Transfer>
        items={list}
        title={(t) => `${t.name} · ${money(t.amount)}/yr ${t.startYear}${t.endYear && t.endYear !== t.startYear ? ' to ' + t.endYear : ''}`}
        empty="Move money between accounts on a schedule: a yearly Roth conversion of a set amount, paying a loan from savings, or moving cash into a brokerage."
        onAdd={() => update((p) => { (p.strategy.transfers ??= []).push({ id: 't' + uid(), name: 'Transfer', from: p.accounts[0]?.id ?? '', to: p.accounts[1]?.id ?? '', amount: 10000, startYear: p.startYear, endYear: p.startYear + 4 }); })}
        onRemove={(i) => update((p) => { p.strategy.transfers!.splice(i, 1); })}
        render={(t, i) => {
          const set = (fn: (x: Transfer) => void) => update((p) => fn(p.strategy.transfers![i]));
          return (
            <>
              <Text label="Name" value={t.name} onChange={(v) => set((x) => { x.name = v; })} />
              <Select label="From" value={t.from} options={accts} onChange={(v) => set((x) => { x.from = v; })} />
              <Select label="To" value={t.to} options={dests} onChange={(v) => set((x) => { x.to = v; })} />
              <Num label="Amount a year (today's $)" value={t.amount} onChange={(v) => set((x) => { x.amount = v; })} />
              <Num label="From year" value={t.startYear} onChange={(v) => set((x) => { x.startYear = v; })} />
              <Num label="To year" value={t.endYear ?? t.startYear} onChange={(v) => set((x) => { x.endYear = v; })} />
            </>
          );
        }}
      />
    </Card>
  );
}

function LocalTaxFields({ value, onChange }: { value?: LocalTax; onChange: (v: LocalTax) => void }) {
  const v = value ?? { kind: 'none' as const };
  const presets = healthJson.local.presets as [string, number, 'wages' | 'income'][];
  return (
    <div className="grid">
      <Select label="Local tax" value={v.kind} options={[['none', 'None'], ['nyc', 'New York City (resident brackets)'], ['wages', 'A flat rate on wages'], ['income', 'A flat rate on taxable income']]}
        onChange={(k) => onChange({ ...v, kind: k })} />
      {(v.kind === 'wages' || v.kind === 'income') && <>
        <Select label="Preset" value={v.name ?? ''} options={[['', 'Custom'], ...presets.map(([n]) => [n, n] as [string, string])]}
          onChange={(n) => { const pr = presets.find((x) => x[0] === n); onChange(pr ? { kind: pr[2], rate: pr[1], name: pr[0] } : { ...v, name: undefined }); }} />
        <Num label="Rate" percent step={0.01} value={v.rate ?? 0} onChange={(r) => onChange({ ...v, rate: r })} />
      </>}
    </div>
  );
}

export function TaxHealthPage() {
  const plan = useActivePlan();
  const update = useUpdate();
  const d = plan.deductions, h = plan.healthcare;
  return (
    <>
      <Card title="Deductions">
        <div className="grid">
          <Check label="Itemize when it beats the standard deduction" value={d.itemize} onChange={(v) => update((p) => { p.deductions.itemize = v; })} />
          <Num label="Property tax (share of home value)" percent step={0.05} value={d.propertyTaxRate} onChange={(v) => update((p) => { p.deductions.propertyTaxRate = v; })} />
          <Check label="Limit mortgage interest to the first $750,000 of home debt" value={!!d.mortgageDebtLimit} onChange={(v) => update((p) => { p.deductions.mortgageDebtLimit = v ? 750000 : undefined; })} />
          {!!d.mortgageDebtLimit && <Num label="Home debt limit ($1,000,000 for loans from before December 16, 2017)" step={50000} value={d.mortgageDebtLimit} onChange={(v) => update((p) => { p.deductions.mortgageDebtLimit = v || undefined; })} />}
          <Num label="Charitable giving a year (today's $)" value={d.charity} onChange={(v) => update((p) => { p.deductions.charity = v; })} />
        </div>
      </Card>
      <Card title="Local income tax">
        <LocalTaxFields value={plan.assumptions.local} onChange={(v) => update((p) => { p.assumptions.local = v; })} />
      </Card>
      <Card title="Health insurance">
        <div className="grid">
          <Check label="Medicare from 65, with income surcharges (IRMAA)" value={h.medicare} onChange={(v) => update((p) => { p.healthcare.medicare = v; })} />
          <Num label="Part D premium a month before surcharges" value={h.partDBase} onChange={(v) => update((p) => { p.healthcare.partDBase = v; })} />
          <Num label="Medigap or Advantage premium a person a month (today's $)" value={h.medigap ?? 0} onChange={(v) => update((p) => { p.healthcare.medigap = v || undefined; })} />
          <Check label="ACA marketplace coverage from retirement to 65" value={h.aca} onChange={(v) => update((p) => { p.healthcare.aca = v; })} />
          <Num label="Benchmark silver premium a person a year" value={h.acaBenchmark} onChange={(v) => update((p) => { p.healthcare.acaBenchmark = v; })} />
        </div>
      </Card>
    </>
  );
}

export function AssumptionsPage() {
  const plan = useActivePlan();
  const update = useUpdate();
  const a = plan.assumptions;
  return (
    <>
    <CurrencyCard />
    <Card title="Tax country">
      <div className="grid">
        <Select label="Taxes follow" value={a.taxCountry ?? 'US'} options={[['US', 'United States (federal and state)'], ['UK', 'United Kingdom (England, Wales, Northern Ireland)'], ['AU', 'Australia (residents)'], ['CA', 'Canada'], ['DE', 'Germany'], ['NL', 'Netherlands']]} onChange={(v) => update((p) => { p.assumptions.taxCountry = v === 'US' ? undefined : v; })} />
        {a.taxCountry === 'UK' && <Check label="Scottish taxpayer" value={!!a.scotland} onChange={(v) => update((p) => { p.assumptions.scotland = v || undefined; })} />}
        {a.taxCountry === 'UK' && <Check label="Take a quarter of each pension withdrawal tax-free" value={!!a.ukLumpSum} onChange={(v) => update((p) => { p.assumptions.ukLumpSum = v || undefined; })} />}
        {a.taxCountry === 'CA' && <Select label="Province or territory" value={a.province ?? 'ON'} options={Object.entries(PROVINCES).map(([k, v]) => [k, v.name] as [string, string])} onChange={(v) => update((p) => { p.assumptions.province = v === 'ON' ? undefined : v; })} />}
      </div>
    </Card>
    <ExpatCard />
    <Card title="Metrics">
        <div className="grid">
          <Select label="Liquid net worth subtracts" value={a.metrics?.liquidDebts ?? 'none'} options={[['none', 'No debts'], ['unsecured', 'Unsecured debts'], ['all', 'All debts, home loans included']]} onChange={(v) => update((p) => { p.assumptions.metrics = { ...p.assumptions.metrics, liquidDebts: v }; })} />
          <Num label="Share of the estate left to charity" percent value={a.metrics?.charityShare ?? 0} onChange={(v) => update((p) => { p.assumptions.metrics = { ...p.assumptions.metrics, charityShare: Math.max(0, Math.min(1, v)) || undefined }; })} />
          <Select label="Effective tax rate over" value={a.metrics?.taxRateBase ?? 'gross'} options={[['gross', 'Gross income'], ['agi', 'Adjusted gross income'], ['taxable', 'Taxable income']]} onChange={(v) => update((p) => { p.assumptions.metrics = { ...p.assumptions.metrics, taxRateBase: v === 'gross' ? undefined : v }; })} />
          <Check label="Count taxes as spending" value={!!a.metrics?.spendingWithTaxes} onChange={(v) => update((p) => { p.assumptions.metrics = { ...p.assumptions.metrics, spendingWithTaxes: v || undefined }; })} />
        </div>
      </Card>
    <Card title="By horizon">
        {(() => {
          const born = plan.people[0]?.birthYear ?? plan.startYear;
          const n = Math.max(30, ...(a.horizons ?? []).map((h) => h.through + 5));
          const ages = Array.from({ length: n }, (_, i) => plan.startYear + i - born);
          const line = (name: string, key: 'inflation' | 'stocks' | 'bonds' | 'cash') => ({ name, type: 'line', step: 'end', symbol: 'none', data: ages.map((_, i) => +(assumptionAt(a, key, i) * 100).toFixed(2)) });
          return <Chart height={240} option={{
            tooltip: { trigger: 'axis', valueFormatter: (v: number) => v + '%' }, legend: {},
            xAxis: { type: 'category', name: 'Age', data: ages }, yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
            series: [line('Inflation', 'inflation'), line('Stocks', 'stocks'), line('Bonds', 'bonds'), line('Cash', 'cash')],
          }} />;
        })()}
        <div className="horizons">
          <div className="hrow head"><span>Plan years</span><span>Inflation</span><span>Stocks</span><span>Bonds</span><span>Cash</span><span /></div>
          {(a.horizons ?? []).map((h, k, all) => (
            <div className="hrow" key={k}>
              <span>{(k ? all[k - 1].through + 1 : 1) + (h.through > (k ? all[k - 1].through + 1 : 1) ? ' to ' + h.through : '')}</span>
              {(['inflation', 'stocks', 'bonds', 'cash'] as const).map((key) => (
                <Num key={key} label="" percent value={h[key] ?? (key === 'inflation' ? a.inflation : a.returns[key])} onChange={(v) => update((p) => { p.assumptions.horizons![k][key] = v; })} />
              ))}
              <button className="ghost danger" onClick={() => update((p) => { p.assumptions.horizons!.splice(k, 1); })}>Remove</button>
            </div>
          ))}
          <div className="hrow"><span>After</span><span>{pct(a.inflation)}</span><span>{pct(a.returns.stocks)}</span><span>{pct(a.returns.bonds)}</span><span>{pct(a.returns.cash)}</span><span /></div>
        </div>
        <div className="row">
          <Num label="New band through plan year" value={0} onChange={(v) => { if (v > 0) update((p) => { (p.assumptions.horizons ??= []).push({ through: Math.round(v) }); p.assumptions.horizons.sort((x, y) => x.through - y.through); }); }} />
          <button className="ghost" onClick={() => update((p) => { Object.assign(p.assumptions, consensus()); })}>Use the analysts' consensus ({MARKET.asOf})</button>
        </div>
      </Card>
      <Card title="Market and inflation assumptions">
      <div className="grid">
        <Num label="Inflation" percent value={a.inflation} onChange={(v) => update((p) => { p.assumptions.inflation = v; })} />
        <Num label="Stock return" percent value={a.returns.stocks} onChange={(v) => update((p) => { p.assumptions.returns.stocks = v; })} />
        <Num label="Bond return" percent value={a.returns.bonds} onChange={(v) => update((p) => { p.assumptions.returns.bonds = v; })} />
        <Num label="Cash return" percent value={a.returns.cash} onChange={(v) => update((p) => { p.assumptions.returns.cash = v; })} />
        <Num label="Stock volatility" percent value={a.volatility.stocks} onChange={(v) => update((p) => { p.assumptions.volatility.stocks = v; })} />
        <Num label="Bond volatility" percent value={a.volatility.bonds} onChange={(v) => update((p) => { p.assumptions.volatility.bonds = v; })} />
        <Num label="Stock-bond correlation" step={0.05} value={a.correlation} onChange={(v) => update((p) => { p.assumptions.correlation = v; })} />
        <Num label="Dividend yield" percent value={a.dividendYield} onChange={(v) => update((p) => { p.assumptions.dividendYield = v; })} />
        <Num label="Qualified share of dividends" percent value={a.qualifiedDividendShare ?? 1} hint="Qualified dividends are taxed at capital gains rates; the rest is ordinary income." onChange={(v) => update((p) => { p.assumptions.qualifiedDividendShare = Math.max(0, Math.min(1, v)); })} />
        <Check label="Use SSA's announced COLAs (2.8% for 2026, 3.6% for 2027)" value={a.announcedCola !== false} onChange={(v) => update((p) => { p.assumptions.announcedCola = v ? undefined : false; })} />
        <Num label="Social Security raises beside inflation" percent step={0.1} value={a.benefitCola ?? 0} hint="0 keeps benefits level with inflation; -0.5 has them lose half a point a year." onChange={(v) => update((p) => { p.assumptions.benefitCola = v || undefined; })} />
      </div>
      <div className="grid" style={{ marginTop: 14 }}>
        <Select label="Tax model" value={a.taxModel?.kind ?? 'us'} options={[['us', 'United States rules (federal, state, local, payroll)'], ['flat', 'One flat rate on all income']]}
          onChange={(v) => update((p) => { p.assumptions.taxModel = { rate: 0.2, ...p.assumptions.taxModel, kind: v }; })} />
        {a.taxModel?.kind === 'flat' && <Num label="Flat rate" percent value={a.taxModel.rate} onChange={(v) => update((p) => { p.assumptions.taxModel!.rate = v; })} />}
      </div>
      <div className="grid" style={{ marginTop: 14 }}>
        <Check label="Stress test: a market crash" value={!!a.crash?.enabled} onChange={(v) => update((p) => { p.assumptions.crash = { year: p.startYear + 5, drop: 0.35, ...p.assumptions.crash, enabled: v }; })} />
        {a.crash?.enabled && <>
          <Num label="Crash year" value={a.crash.year} onChange={(v) => update((p) => { p.assumptions.crash!.year = v; })} />
          <Num label="Stocks fall by" percent value={a.crash.drop} onChange={(v) => update((p) => { p.assumptions.crash!.drop = v; })} />
        </>}
      </div>
    </Card>
    </>
  );
}
