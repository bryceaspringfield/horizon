// The pages where the plan is entered: people, accounts, income, Social Security, expenses, milestones, the strategy,
// and the assumptions.
import { uid } from '../engine/defaults';
import type { Account, AccountKind, Expense, ExpenseKind, Income, IncomeKind, Milestone, WithdrawalStep } from '../engine/types';
import statesJson from '../data/states.json';
import { useActivePlan, useStore } from '../store';
import { Card, Check, ListEditor, Num, Select, Text, money, pct } from '../ui';
import { benefitAtClaim } from '../engine/retirement';

const ACCOUNT_KINDS: [AccountKind, string][] = [
  ['cash', 'Cash (checking, savings)'], ['taxable', 'Taxable brokerage'], ['traditional', 'Traditional 401(k) / IRA'],
  ['roth', 'Roth 401(k) / IRA'], ['hsa', 'HSA'], ['college529', '529 college savings'], ['asset', 'Asset (home, car)'], ['debt', 'Debt (mortgage, loan)'],
];
const INCOME_KINDS: [IncomeKind, string][] = [
  ['salary', 'Salary'], ['selfEmployment', 'Self-employment'], ['rental', 'Rental'], ['pension', 'Pension'], ['annuity', 'Annuity'], ['windfall', 'One-time windfall'], ['other', 'Other'],
];
const EXPENSE_KINDS: [ExpenseKind, string][] = [
  ['living', 'Living expenses'], ['housing', 'Housing'], ['healthcare', 'Healthcare'], ['education', 'Education'], ['travel', 'Travel'], ['oneTime', 'One-time'], ['other', 'Other'],
];

function useUpdate() {
  return useStore((s) => s.update);
}

export function PeoplePage() {
  const plan = useActivePlan();
  const update = useUpdate();
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
        </div>
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
                {a.kind === 'asset' && <>
                  <Num label="Yearly appreciation" percent value={a.appreciation ?? 0.03} onChange={(v) => set((x) => { x.appreciation = v; })} />
                  <Num label="Sale year (0 for none)" value={a.saleYear ?? 0} onChange={(v) => set((x) => { x.saleYear = v || undefined; })} />
                </>}
                {a.kind === 'debt' && <>
                  <Num label="Interest rate" percent value={a.interestRate ?? 0} onChange={(v) => set((x) => { x.interestRate = v; })} />
                  <Num label="Yearly payment" value={a.payment ?? 0} onChange={(v) => set((x) => { x.payment = v; })} />
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
                <Select label="Type" value={x.kind} options={INCOME_KINDS} onChange={(v) => set((y) => { y.kind = v; })} />
                <Select label="Owner" value={x.ownerId} options={owner} onChange={(v) => set((y) => { y.ownerId = v; })} />
                <Num label="Yearly amount (today's $)" value={x.amount} onChange={(v) => set((y) => { y.amount = v; })} />
                <Num label="Real growth a year" percent value={x.growth} onChange={(v) => set((y) => { y.growth = v; })} />
                <Num label="Start year" value={x.startYear} onChange={(v) => set((y) => { y.startYear = v; })} />
                <Num label="End year (0: at retirement or death)" value={x.endYear ?? 0} onChange={(v) => set((y) => { y.endYear = v || undefined; })} />
                <Check label="Keeps pace with inflation" value={x.inflationAdjusted} onChange={(v) => set((y) => { y.inflationAdjusted = v; })} />
                <Check label="Taxable" value={x.taxable} onChange={(v) => set((y) => { y.taxable = v; })} />
                {x.kind === 'salary' && <>
                  <Num label="401(k) contribution" percent value={x.contributionRate ?? 0} onChange={(v) => set((y) => { y.contributionRate = v; })} />
                  <Check label="Roth 401(k)" value={!!x.contributionRoth} onChange={(v) => set((y) => { y.contributionRoth = v; })} />
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
              <Select label="Type" value={x.kind} options={EXPENSE_KINDS} onChange={(v) => set((y) => { y.kind = v; })} />
              <Num label={x.kind === 'oneTime' ? "Amount (today's $)" : "Yearly amount (today's $)"} value={x.amount} onChange={(v) => set((y) => { y.amount = v; })} />
              <Num label={x.kind === 'oneTime' ? 'Year' : 'Start year'} value={x.startYear} onChange={(v) => set((y) => { y.startYear = v; })} />
              {x.kind !== 'oneTime' && <Num label="End year (0: for life)" value={x.endYear ?? 0} onChange={(v) => set((y) => { y.endYear = v || undefined; })} />}
              <Num label="Growth above inflation" percent value={x.growth} onChange={(v) => set((y) => { y.growth = v; })} />
              {x.kind === 'education' && <Select label="Paid from" value={x.fundedBy ?? ''} options={funds} onChange={(v) => set((y) => { y.fundedBy = v || undefined; })} />}
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
              <Select label="When" value={m.kind} options={[['year', 'A year'], ['age', 'An age'], ['financialIndependence', 'Financial independence'], ['netWorth', 'A net worth']]} onChange={(v) => set((y) => { y.kind = v; })} />
              {m.kind === 'year' && <Num label="Year" value={m.year} onChange={(v) => set((y) => { y.year = v; })} />}
              {m.kind === 'age' && <>
                <Select label="Person" value={m.personId ?? plan.people[0].id} options={plan.people.map((p) => [p.id, p.name] as [string, string])} onChange={(v) => set((y) => { y.personId = v; })} />
                <Num label="Age" value={m.age} onChange={(v) => set((y) => { y.age = v; })} />
              </>}
              {m.kind === 'netWorth' && <Num label="Net worth (today's $)" value={m.netWorth} onChange={(v) => set((y) => { y.netWorth = v; })} />}
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
          <Select label="Spending rule" value={s.spending} options={[['expenses', 'The plan\'s expenses'], ['fixedPercent', 'Fixed share of the portfolio'], ['guardrails', 'Guardrails (±10% when the rate drifts 20%)']]}
            onChange={(v) => update((p) => { p.strategy.spending = v; })} />
          {s.spending !== 'expenses' && <Num label="Withdrawal rate" percent value={s.spendingRate} onChange={(v) => update((p) => { p.strategy.spendingRate = v; })} />}
          <Num label="Safe withdrawal rate (FI test)" percent value={s.safeWithdrawalRate} onChange={(v) => update((p) => { p.strategy.safeWithdrawalRate = v; })} />
        </div>
      </Card>
      <Card title="Roth conversions">
        <div className="grid">
          <Select label="Fill up to the bracket" value={String(s.rothConversionBracket)} options={[['0', 'No conversions'], ['0.1', '10%'], ['0.12', '12%'], ['0.22', '22%'], ['0.24', '24%'], ['0.32', '32%']]}
            onChange={(v) => update((p) => { p.strategy.rothConversionBracket = Number(v); })} />
          <Num label="From year" value={s.rothConversionStart ?? plan.startYear} onChange={(v) => update((p) => { p.strategy.rothConversionStart = v; })} />
          <Num label="To year" value={s.rothConversionEnd ?? plan.startYear + 30} onChange={(v) => update((p) => { p.strategy.rothConversionEnd = v; })} />
        </div>
        <p className="muted">Each year in the window, traditional balances move to Roth until ordinary taxable income reaches the top of the chosen bracket ({pct(s.rothConversionBracket, 0)}).</p>
      </Card>
    </>
  );
}

export function AssumptionsPage() {
  const plan = useActivePlan();
  const update = useUpdate();
  const a = plan.assumptions;
  return (
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
      <p className="muted">Returns are nominal yearly averages. From 1928 to 2025, the S&P 500 returned 11.9% a year on average (10.0% compounded), 10-year Treasuries 4.8%, T-bills 3.4%, and inflation averaged 3.1% (Damodaran, NYU Stern).</p>
    </Card>
  );
}
