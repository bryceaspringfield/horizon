// The pages where the plan is entered: people, accounts, income, Social Security, expenses, milestones, the strategy,
// and the assumptions.
import { uid } from '../engine/defaults';
import healthJson from '../data/healthcare.json';
import type { LocalTax, Account, AccountKind, Expense, ExpenseKind, Income, IncomeKind, LifeEvent, Milestone, Step, Transfer, WithdrawalStep } from '../engine/types';
import { estimatePia } from '../engine/retirement';
import { useProjection } from '../useProjection';
import statesJson from '../data/states.json';
import { useActivePlan, useStore } from '../store';
import { Card, Check, ListEditor, Num, Select, Text, money, pct } from '../ui';
import { CURRENCIES, foreignCurrencies, formatMoney, planCurrency } from '../engine/currency';
import { benefitAtClaim } from '../engine/retirement';

const ACCOUNT_KINDS: [AccountKind, string][] = [
  ['cash', 'Cash (checking, savings)'], ['taxable', 'Taxable brokerage'], ['traditional', 'Traditional 401(k) / IRA'],
  ['roth', 'Roth 401(k) / IRA'], ['hsa', 'HSA'], ['college529', '529 college savings'], ['asset', 'Asset (home, car)'], ['debt', 'Debt (mortgage, loan)'],
];
const INCOME_KINDS: [IncomeKind, string][] = [
  ['salary', 'Salary'], ['selfEmployment', 'Self-employment'], ['rental', 'Rental'], ['pension', 'Pension'], ['annuity', 'Annuity'], ['windfall', 'One-time windfall'], ['rsu', 'RSU grant (total value)'], ['other', 'Other'],
];
const EXPENSE_KINDS: [ExpenseKind, string][] = [
  ['living', 'Living expenses'], ['housing', 'Housing'], ['healthcare', 'Healthcare'], ['education', 'Education'], ['travel', 'Travel'], ['oneTime', 'One-time'], ['other', 'Other'],
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
      <p className="muted">{abroad
        ? 'The exclusion leaves out up to $132,900 a person (2026) of pay marked "Earned while living abroad" on the Income page. Foreign income tax entered on an income is credited toward US tax on that income, and credit left unused carries forward ten years. With the exclusion claimed, foreign tax on the excluded pay earns no credit.'
        : 'Mark a salary or self-employment income as "Earned while living abroad" on the Income page, and enter the foreign income tax paid on it. Horizon then applies the foreign tax credit, and the exclusion where you claim it here.'}</p>
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
      <p className="muted">Every result is shown in the plan's currency. Changing it relabels the plan's amounts and converts none of them. An account, an income, or an expense can be held in another currency, chosen on its own page; each such currency gets an exchange rate here.</p>
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

/** Changes of an income's or expense's yearly amount from a year on. */
function StepsEditor({ steps, nominal, onChange }: { steps?: Step[]; nominal?: boolean; onChange: (s: Step[]) => void }) {
  const list = steps ?? [];
  return (
    <div className="span steps">
      {list.map((st, j) => (
        <div key={j} className="row">
          <Num label="From year" value={st.year} onChange={(v) => onChange(list.map((x, k) => (k === j ? { ...x, year: v } : x)))} />
          <Num label={nominal ? 'New yearly amount (that year\'s $)' : "New yearly amount (today's $)"} value={st.amount} onChange={(v) => onChange(list.map((x, k) => (k === j ? { ...x, amount: v } : x)))} />
          <button className="ghost danger" onClick={() => onChange(list.filter((_, k) => k !== j))}>Remove</button>
        </div>
      ))}
      <button className="ghost" onClick={() => onChange([...list, { year: new Date().getFullYear() + 5, amount: 0 }])}>+ A change from a year on</button>
    </div>
  );
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
      <Card title="People">
        <ListEditor
          items={plan.people}
          title={(p) => `${p.name}, born ${p.birthYear}`}
          empty="Add yourself first."
          onAdd={() => update((p) => { if (p.people.length < 2) p.people.push({ id: 'p' + uid(), name: 'Partner', birthYear: p.startYear - 35, lifeExpectancy: 92 }); })}
          onRemove={(i) => update((p) => { if (p.people.length > 1) p.people.splice(i, 1); })}
          render={(person, i) => (
            <>
              <Text label="Name" value={person.name} onChange={(v) => update((p) => { p.people[i].name = v; })} />
              <Num label="Birth year" value={person.birthYear} onChange={(v) => update((p) => { p.people[i].birthYear = v; })} />
              <Num label="Plan to age" value={person.lifeExpectancy} onChange={(v) => update((p) => { p.people[i].lifeExpectancy = v; })} />
              <Num label="Retirement age" value={plan.strategy.retirementAge[person.id]} onChange={(v) => update((p) => { p.strategy.retirementAge[person.id] = v; })} />
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
                </>}
                {(invested || a.kind === 'cash') && <>
                  <Check label="Its own yearly return, not the market mix" value={typeof a.customReturn === 'number'} onChange={(v) => set((x) => { x.customReturn = v ? 0.05 : undefined; })} />
                  {typeof a.customReturn === 'number' && <Num label="Yearly return (after fees)" percent value={a.customReturn} onChange={(v) => set((x) => { x.customReturn = v; })} />}
                  <Check label="Return tied to inflation (Series I bonds, TIPS)" value={typeof a.inflationLinked === 'number'} onChange={(v) => set((x) => { x.inflationLinked = v ? 0.01 : undefined; })} />
                  {typeof a.inflationLinked === 'number' && <Num label="Fixed rate above inflation" percent value={a.inflationLinked} onChange={(v) => set((x) => { x.inflationLinked = v; })} />}
                </>}
                {a.kind === 'taxable' && <Check label="Pay dividends and interest out to cash (not reinvested)" value={!!a.dividendsPaidOut} onChange={(v) => set((x) => { x.dividendsPaidOut = v; })} />}
                {a.kind === 'taxable' && <Num label="Foreign tax withheld on dividends" percent value={a.foreignWithholding ?? 0} hint="The share of this account's dividends a foreign country withholds; it counts toward the US foreign tax credit." onChange={(v) => set((x) => { x.foreignWithholding = v || undefined; })} />}
                {a.kind === 'asset' && <>
                  <Check label="Real estate (property tax, deductible mortgage interest)" value={!!a.realEstate} onChange={(v) => set((x) => { x.realEstate = v; })} />
                  <Num label="Yearly appreciation" percent value={a.appreciation ?? 0.03} onChange={(v) => set((x) => { x.appreciation = v; })} />
                  <Num label="Yearly rent, if rented (today's $)" value={a.rent ?? 0} onChange={(v) => set((x) => { x.rent = v || undefined; })} />
                  {!!a.rent && <Num label="Vacancy" percent value={a.vacancy ?? 0.05} onChange={(v) => set((x) => { x.vacancy = v; })} />}
                  {!!a.rent && <Num label="Rental costs (share of rent)" percent value={a.rentalCosts ?? 0.35} onChange={(v) => set((x) => { x.rentalCosts = v; })} />}
                  <Num label="Sale year (0 for none)" value={a.saleYear ?? 0} onChange={(v) => set((x) => { x.saleYear = v || undefined; })} />
                </>}
                {a.kind === 'debt' && <>
                  <Num label="Interest rate" percent value={a.interestRate ?? 0} onChange={(v) => set((x) => { x.interestRate = v; })} />
                  <Num label="Yearly payment" value={a.payment ?? 0} onChange={(v) => set((x) => { x.payment = v; })} />
                  <Num label="Extra payment a year (today's $)" value={a.extraPayment ?? 0} onChange={(v) => set((x) => { x.extraPayment = v; })} />
                  <Num label="Forgiven in year (0 for none)" value={a.forgiveYear ?? 0} onChange={(v) => set((x) => { x.forgiveYear = v || undefined; })} />
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
                <Select label="Type" value={x.kind} options={INCOME_KINDS} onChange={(v) => set((y) => { y.kind = v; })} />
                <Select label="Owner" value={x.ownerId} options={owner} onChange={(v) => set((y) => { y.ownerId = v; })} />
                <Num label={x.nominal ? 'Yearly amount (start year\'s $)' : "Yearly amount (today's $)"} value={x.amount} onChange={(v) => set((y) => { y.amount = v; })} />
                <Num label="Real growth a year" percent value={x.growth} onChange={(v) => set((y) => { y.growth = v; })} />
                <Num label="Start year" value={x.startYear} onChange={(v) => set((y) => { y.startYear = v; })} />
                <Num label="End year (0: at retirement or death)" value={x.endYear ?? 0} onChange={(v) => set((y) => { y.endYear = v || undefined; })} />
                <Check label="Keeps pace with inflation" value={x.inflationAdjusted} onChange={(v) => set((y) => { y.inflationAdjusted = v; })} />
                <Check label="Taxable" value={x.taxable} onChange={(v) => set((y) => { y.taxable = v; })} />
                <Check label="Amounts in future dollars of their year" value={!!x.nominal} onChange={(v) => set((y) => { y.nominal = v; })} />
                {x.kind === 'selfEmployment' && <Check label="A specified service business (law, health, consulting...)" value={!!x.serviceBusiness} onChange={(v) => set((y) => { y.serviceBusiness = v; })} />}
                {x.kind !== 'windfall' && <StepsEditor steps={x.steps} nominal={x.nominal} onChange={(st) => set((y) => { y.steps = st; })} />}
                {x.kind === 'rsu' && <Num label="Vests over (years)" value={x.vestYears ?? 4} onChange={(v) => set((y) => { y.vestYears = v; })} />}
                {x.kind === 'rsu' && <Num label="Cliff (years before the first vesting)" value={x.vestCliffYears ?? 0} hint="With a one-year cliff, nothing vests in the first year and two parts vest in the second." onChange={(v) => set((y) => { y.vestCliffYears = v || undefined; })} />}
                {x.kind === 'salary' && <>
                  <Num label="401(k) contribution" percent value={x.contributionRate ?? 0} onChange={(v) => set((y) => { y.contributionRate = v; })} />
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
        <p className="muted">Enter the monthly benefit at full retirement age (67) from your statement at ssa.gov/myaccount.</p>
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
              <Num label="Claim age (62 to 70)" value={ss.claimAge} step={1} onChange={(v) => update((p) => { p.socialSecurity[i].claimAge = Math.min(70, Math.max(62, v)); })} />
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

export function ExpensesPage() {
  const plan = useActivePlan();
  const update = useUpdate();
  const funds = [['', 'Cash flow'], ...plan.accounts.filter((a) => a.kind === 'college529').map((a) => [a.id, a.name])] as [string, string][];
  return (
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
              <Select label="Type" value={x.kind} options={EXPENSE_KINDS} onChange={(v) => set((y) => { y.kind = v; })} />
              <Num label={(x.kind === 'oneTime' ? 'Amount' : 'Yearly amount') + (x.nominal ? " (that year's $)" : " (today's $)")} value={x.amount} onChange={(v) => set((y) => { y.amount = v; })} />
              <Num label={x.kind === 'oneTime' ? 'Year' : 'Start year'} value={x.startYear} onChange={(v) => set((y) => { y.startYear = v; })} />
              {x.kind !== 'oneTime' && <Num label="End year (0: for life)" value={x.endYear ?? 0} onChange={(v) => set((y) => { y.endYear = v || undefined; })} />}
              <Num label="Growth above inflation" percent value={x.growth} onChange={(v) => set((y) => { y.growth = v; })} />
              <Check label="Amounts in future dollars of their year" value={!!x.nominal} onChange={(v) => set((y) => { y.nominal = v; })} />
              {x.kind !== 'oneTime' && <StepsEditor steps={x.steps} nominal={x.nominal} onChange={(st) => set((y) => { y.steps = st; })} />}
              {x.kind === 'education' && <Select label="Paid from" value={x.fundedBy ?? ''} options={funds} onChange={(v) => set((y) => { y.fundedBy = v || undefined; })} />}
            </>
          );
        }}
      />
    </Card>
  );
}

const EVENT_KINDS: [LifeEvent['kind'], string][] = [['homePurchase', 'Buy a home'], ['rentalProperty', 'Buy a rental property'], ['child', 'Have a child'], ['careerBreak', 'Career break'], ['payChange', 'Pay change'], ['move', 'Move to another state'], ['inheritance', 'Inheritance'], ['recurring', 'Recurring purchase'], ['separation', 'Separation or divorce']];

function newEvent(kind: LifeEvent['kind'], year: number, personId: string): LifeEvent {
  const id = uid();
  if (kind === 'homePurchase') return { id, kind, name: 'New home', year, price: 600000, downPayment: 0.2, rate: 0.065, termYears: 30, appreciation: 0.03, closingCosts: 0.03 };
  if (kind === 'child') return { id, kind, name: 'Child', year, yearlyCost: 15000, collegeYearly: 30000, collegeYears: 4 };
  if (kind === 'careerBreak') return { id, kind, name: 'Career break', personId, year, endYear: year + 1 };
  if (kind === 'payChange') return { id, kind, name: 'Promotion', personId, year, factor: 1.2 };
  if (kind === 'move') return { id, kind, name: 'Move', year, state: 'TX' };
  if (kind === 'inheritance') return { id, kind, name: 'Inheritance', year, amount: 200000, asIra: false };
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
              <Num label="Year" value={e.year} onChange={(v) => set((x) => { x.year = v; })} />
              {e.kind === 'homePurchase' && <>
                <Num label="Price (today's $)" value={e.price} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.price = v; })} />
                <Num label="Down payment" percent value={e.downPayment} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.downPayment = v; })} />
                <Num label="Closing costs" percent value={e.closingCosts} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.closingCosts = v; })} />
                <Num label="Mortgage rate" percent value={e.rate} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.rate = v; })} />
                <Num label="Term (years)" value={e.termYears} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.termYears = v; })} />
                <Num label="Yearly appreciation" percent value={e.appreciation} onChange={(v) => set((x) => { if (x.kind === 'homePurchase') x.appreciation = v; })} />
              </>}
              {e.kind === 'child' && <>
                <Num label="Yearly cost to 18 (today's $)" value={e.yearlyCost} onChange={(v) => set((x) => { if (x.kind === 'child') x.yearlyCost = v; })} />
                <Num label="College a year (today's $)" value={e.collegeYearly} onChange={(v) => set((x) => { if (x.kind === 'child') x.collegeYearly = v; })} />
                <Num label="College years" value={e.collegeYears} onChange={(v) => set((x) => { if (x.kind === 'child') x.collegeYears = v; })} />
              </>}
              {(e.kind === 'careerBreak' || e.kind === 'payChange') && (
                <Select label="Person" value={e.personId} options={people} onChange={(v) => set((x) => { if (x.kind === 'careerBreak' || x.kind === 'payChange') x.personId = v; })} />
              )}
              {e.kind === 'careerBreak' && <Num label="Back to work after" value={e.endYear} onChange={(v) => set((x) => { if (x.kind === 'careerBreak') x.endYear = v; })} />}
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
      <p className="muted">A home purchase adds the home, its mortgage (payment from the rate and term), the down payment and closing costs, and property tax; a child adds yearly costs to 18 and college after, paid first from a 529 account if you have one; a career break stops that person's pay; a pay change scales it from that year on; a rental adds the property, its mortgage, and net rent as taxable income; a move changes the state income tax from that year; an inheritance arrives as cash, or as an inherited IRA emptied over ten years as taxable income; a recurring purchase repeats every few years; a separation takes the person who leaves out of the plan (their pay and Social Security), keeps a share of every account, scales the expenses, files single (or head of household with children), and can add support payments.</p>
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
              <Select label="When" value={m.kind} options={[['year', 'A year'], ['age', 'An age'], ['financialIndependence', 'Financial independence'], ['netWorth', 'A net worth'], ['all', 'All of several conditions']]} onChange={(v) => set((y) => { y.kind = v; })} />
              {m.kind === 'year' && <Num label="Year" value={m.year} onChange={(v) => set((y) => { y.year = v; })} />}
              {m.kind === 'age' && <>
                <Select label="Person" value={m.personId ?? plan.people[0].id} options={plan.people.map((p) => [p.id, p.name] as [string, string])} onChange={(v) => set((y) => { y.personId = v; })} />
                <Num label="Age" value={m.age} onChange={(v) => set((y) => { y.age = v; })} />
              </>}
              {m.kind === 'netWorth' && <Num label="Net worth (today's $)" value={m.netWorth} onChange={(v) => set((y) => { y.netWorth = v; })} />}
              {m.kind === 'all' && <div className="span">
                {(m.conditions ?? []).map((c, j) => (
                  <div key={j} className="row">
                    <Select label="Condition" value={c.kind} options={[['year', 'From a year'], ['age', 'From an age'], ['financialIndependence', 'Once financially independent'], ['netWorth', 'Net worth at least']]}
                      onChange={(v) => set((y) => { y.conditions![j] = { kind: v, personId: plan.people[0].id }; })} />
                    {c.kind === 'year' && <Num label="Year" value={c.year} onChange={(v) => set((y) => { y.conditions![j].year = v; })} />}
                    {c.kind === 'age' && <>
                      <Select label="Person" value={c.personId ?? plan.people[0].id} options={plan.people.map((p) => [p.id, p.name] as [string, string])} onChange={(v) => set((y) => { y.conditions![j].personId = v; })} />
                      <Num label="Age" value={c.age} onChange={(v) => set((y) => { y.conditions![j].age = v; })} />
                    </>}
                    {c.kind === 'netWorth' && <Num label="Net worth (today's $)" value={c.netWorth} onChange={(v) => set((y) => { y.conditions![j].netWorth = v; })} />}
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

export function StrategyPage() {
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
      <Card title="Saving while working">
        <div className="grid">
          <Num label="Cash to keep on hand (today's $)" value={s.cashTarget} onChange={(v) => update((p) => { p.strategy.cashTarget = v; })} />
          <Num label="Traditional IRA a year" value={s.iraContribution} onChange={(v) => update((p) => { p.strategy.iraContribution = v; })} />
          <Num label="Roth IRA a year" value={s.rothIraContribution} onChange={(v) => update((p) => { p.strategy.rothIraContribution = v; })} />
          <Num label="HSA a year" value={s.hsaContribution} onChange={(v) => update((p) => { p.strategy.hsaContribution = v; })} />
          <Check label="Backdoor Roth (no income limit on the Roth IRA)" value={!!s.backdoorRoth} onChange={(v) => update((p) => { p.strategy.backdoorRoth = v; })} />
          <Num label="Mega backdoor Roth a year" value={s.megaBackdoor ?? 0} onChange={(v) => update((p) => { p.strategy.megaBackdoor = v; })} />
          <Select label="Leftover pay goes to" value={s.surplusTo ?? 'invest'} options={[['invest', 'Investing (taxable account)'], ['debt', 'Paying debts down first']]} onChange={(v) => update((p) => { p.strategy.surplusTo = v; })} />
        </div>
        <p className="muted">Each contribution is capped at the year's IRS limit, catch-up included. Pay left after expenses and contributions fills the cash target, then goes to the taxable account.</p>
      </Card>
      <Card title="Withdrawals in retirement">
        <ol className="order">
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
          {s.withdrawalOrderLater && <Num label="From the year" value={s.withdrawalOrderLater.year} onChange={(v) => update((p) => { p.strategy.withdrawalOrderLater!.year = v; })} />}
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
        </ol>}
        <div className="grid">
          <Select label="How to draw" value={s.withdrawalMethod ?? 'order'} options={[['order', 'In the order above'], ['proportional', 'In proportion to balances']]}
            onChange={(v) => update((p) => { p.strategy.withdrawalMethod = v; })} />
          <Select label="Shield withdrawals under" value={s.shield ?? 'none'} options={[['none', 'No limit'], ['bracket12', 'The 12% bracket'], ['bracket22', 'The 22% bracket'], ['bracket24', 'The 24% bracket'], ['irmaa', 'The first IRMAA tier'], ['aca', 'The ACA credit limit (400% FPL)']]}
            onChange={(v) => update((p) => { p.strategy.shield = v; })} />
          <Check label="Realize gains in the 0% capital gains band each year" value={!!s.harvestZeroGains} onChange={(v) => update((p) => { p.strategy.harvestZeroGains = v; })} />
          <Select label="Spending rule" value={s.spending} options={[['expenses', 'The plan\'s expenses'], ['fixedPercent', 'Fixed share of the portfolio'], ['guardrails', 'Guardrails (±10% when the rate drifts 20%)'], ['vpw', 'Variable percentage (spend down by the plan end)'], ['textbook', 'Textbook rule (a share of the first year, then with inflation)']]}
            onChange={(v) => update((p) => { p.strategy.spending = v; })} />
          {(s.spending === 'fixedPercent' || s.spending === 'guardrails' || s.spending === 'textbook') && <Num label="Withdrawal rate" percent value={s.spendingRate} onChange={(v) => update((p) => { p.strategy.spendingRate = v; })} />}
          <Num label="Safe withdrawal rate (FI test)" percent value={s.safeWithdrawalRate} onChange={(v) => update((p) => { p.strategy.safeWithdrawalRate = v; })} />
          <Check label="Count real assets (home equity) toward FI and net worth milestones" value={!!s.fiCountsRealAssets} onChange={(v) => update((p) => { p.strategy.fiCountsRealAssets = v; })} />
          <Check label="Give to charity from IRAs from 71 (qualified charitable distributions)" value={!!s.qcd} onChange={(v) => update((p) => { p.strategy.qcd = v; })} />
        </div>
        <p className="muted">A qualified charitable distribution pays the plan's yearly charity (Taxes and health) straight from a traditional IRA, up to $111,000 a person in 2026 ($114,000 in 2027), counts toward the RMD, and is left out of income. An HSA pays the year's healthcare expenses and premiums tax-free; HSA money spent on anything else is income, with a 20% penalty before 65.</p>
      </Card>
      <TransfersCard />
      <Card title="Asset allocation over time (glide path)">
        <div className="grid">
          <Check label="Shift from stocks to bonds with age" value={!!s.glidePath?.enabled} onChange={(v) => update((p) => { p.strategy.glidePath = { startAge: 45, endAge: 70, endStocks: 0.5, ...p.strategy.glidePath, enabled: v }; })} />
          {s.glidePath?.enabled && <>
            <Num label="From age" value={s.glidePath.startAge} onChange={(v) => update((p) => { p.strategy.glidePath!.startAge = v; })} />
            <Num label="To age" value={s.glidePath.endAge} onChange={(v) => update((p) => { p.strategy.glidePath!.endAge = v; })} />
            <Num label="Stocks at the end" percent value={s.glidePath.endStocks} onChange={(v) => update((p) => { p.strategy.glidePath!.endStocks = v; })} />
          </>}
        </div>
        <p className="muted">Each invested account starts from its own mix and moves in a straight line to the end share by its owner's age; the rest goes to bonds.</p>
      </Card>
      <Card title="Roth conversions">
        <div className="grid">
          <Select label="Fill up to the bracket" value={String(s.rothConversionBracket)} options={[['0', 'No conversions'], ['0.1', '10%'], ['0.12', '12%'], ['0.22', '22%'], ['0.24', '24%'], ['0.32', '32%']]}
            onChange={(v) => update((p) => { p.strategy.rothConversionBracket = Number(v); })} />
          <Num label="From year" value={s.rothConversionStart ?? plan.startYear} onChange={(v) => update((p) => { p.strategy.rothConversionStart = v; })} />
          <Num label="To year" value={s.rothConversionEnd ?? plan.startYear + 30} onChange={(v) => update((p) => { p.strategy.rothConversionEnd = v; })} />
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
        <p className="muted">Each year in the window, traditional balances move to Roth until ordinary taxable income reaches the top of the chosen bracket ({pct(s.rothConversionBracket, 0)}).</p>
      </Card>
    </>
  );
}

function TransfersCard() {
  const plan = useActivePlan();
  const update = useUpdate();
  const list = plan.strategy.transfers ?? [];
  const accts = plan.accounts.filter((a) => a.kind !== 'asset').map((a) => [a.id, a.name] as [string, string]);
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
              <Select label="To" value={t.to} options={accts} onChange={(v) => set((x) => { x.to = v; })} />
              <Num label="Amount a year (today's $)" value={t.amount} onChange={(v) => set((x) => { x.amount = v; })} />
              <Num label="From year" value={t.startYear} onChange={(v) => set((x) => { x.startYear = v; })} />
              <Num label="To year" value={t.endYear ?? t.startYear} onChange={(v) => set((x) => { x.endYear = v; })} />
            </>
          );
        }}
      />
      <p className="muted">Each transfer moves up to the amount while the source has it, with the tax the move causes: traditional to Roth is a conversion, traditional to anything else is taxable income (with the 10% penalty before 59½), a taxable account's sale realizes its gains, and HSA money is spent outside healthcare. A transfer to a debt pays it down.</p>
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
          <Num label="Charitable giving a year (today's $)" value={d.charity} onChange={(v) => update((p) => { p.deductions.charity = v; })} />
        </div>
        <p className="muted">Itemized deductions add mortgage interest on debts secured by real estate, charity, and state income and property taxes up to the SALT cap ($40,400 in 2026, rising 1% a year to 2029, falling by 30% of income above $505,000 to a $10,000 floor, and $10,000 from 2030). Property tax and charity also count as spending.</p>
      </Card>
      <Card title="Local income tax">
        <LocalTaxFields value={plan.assumptions.local} onChange={(v) => update((p) => { p.assumptions.local = v; })} />
        <p className="muted">New York City uses its resident brackets (3.078% to 3.876%). The city presets are each city's 2025 resident rate; check your city's current rate and edit it. A move event can set the local tax of the new place.</p>
      </Card>
      <Card title="Health insurance">
        <div className="grid">
          <Check label="Medicare from 65, with income surcharges (IRMAA)" value={h.medicare} onChange={(v) => update((p) => { p.healthcare.medicare = v; })} />
          <Num label="Part D premium a month before surcharges" value={h.partDBase} onChange={(v) => update((p) => { p.healthcare.partDBase = v; })} />
          <Check label="ACA marketplace coverage from retirement to 65" value={h.aca} onChange={(v) => update((p) => { p.healthcare.aca = v; })} />
          <Num label="Benchmark silver premium a person a year" value={h.acaBenchmark} onChange={(v) => update((p) => { p.healthcare.acaBenchmark = v; })} />
        </div>
        <p className="muted">Medicare: the 2026 and 2027 Part B premiums ($202.90, $209.40 a month) and CMS's surcharge tiers on income from two years earlier. ACA: the benchmark premium less the premium tax credit, which caps it at 2.1% to 9.96% of income (2026) up to 400% of the poverty line and ends above it. Look up your benchmark at healthcare.gov.</p>
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
    <ExpatCard />
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
      <p className="muted">Returns are nominal yearly averages. From 1928 to 2025, the S&P 500 returned 11.9% a year on average (10.0% compounded), 10-year Treasuries 4.8%, T-bills 3.4%, and inflation averaged 3.1% (Damodaran, NYU Stern).</p>
    </Card>
    </>
  );
}
