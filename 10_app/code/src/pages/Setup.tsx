// The first-run setup: six short steps which build the user's own plan (engine/setup.ts), with the example plan one
// click away on every step. Shown by App until settings.setupDone is set.
import { useState } from 'react';
import statesJson from '../data/states.json';
import { examplePlan } from '../engine/defaults';
import { blankAnswers, planFromAnswers, setupBenefit, type SetupAnswers, type SetupPerson } from '../engine/setup';
import type { FilingStatus, Plan } from '../engine/types';
import { Icon } from '../icons';
import { useStore } from '../store';
import { Check, Num, Select, Text } from '../ui';

const STEPS = ['About you', 'Income and retirement', 'Savings and investments', 'Home and debts', 'Spending and saving', 'Review'];
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Opens the app on the plan; the user's own plan becomes the main plan, the example stays unmarked. */
function finish(plan: Plan, own: boolean) {
  useStore.setState((st) => ({ plans: [plan], activeId: plan.id, compareIds: [], settings: { ...st.settings, setupDone: true, mainPlanId: own ? plan.id : undefined } }));
  window.scrollTo(0, 0);
}

export function Setup() {
  const year = new Date().getFullYear();
  const [a, setA] = useState<SetupAnswers>(() => blankAnswers(year));
  const [step, setStep] = useState(0);
  const set = (patch: Partial<SetupAnswers>) => setA((x) => ({ ...x, ...patch }));
  const people: ['you' | 'partner', string][] = a.hasPartner ? [['you', a.you.name || 'You'], ['partner', a.partner.name || 'Your partner']] : [['you', 'You']];
  const setPerson = (k: 'you' | 'partner', patch: Partial<SetupPerson>) => setA((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const age = (p: SetupPerson) => year - p.birthYear;

  const personFields = (k: 'you' | 'partner', title: string) => (
    <div className="grid" key={k}>
      <Text label={title + ': first name'} value={a[k].name} onChange={(v) => setPerson(k, { name: v })} />
      <Num label="Age" value={age(a[k])} onChange={(v) => setPerson(k, { birthYear: year - Math.max(0, Math.min(110, v)) })} />
    </div>
  );

  const body = [
    <>
      <p className="muted">A few questions set Horizon up for your situation. Rough numbers are fine, and you can change everything later.</p>
      {personFields('you', 'You')}
      <Check label="I am planning with a spouse or partner" value={a.hasPartner}
        onChange={(v) => set({ hasPartner: v, filingStatus: v ? 'mfj' : 'single' })} />
      {a.hasPartner && personFields('partner', 'Partner')}
      <div className="grid">
        <Select label="State you live in" value={a.state} options={Object.keys(statesJson).sort().map((s) => [s, s] as [string, string])} onChange={(v) => set({ state: v })} />
        <Select<FilingStatus> label="Tax filing status" value={a.filingStatus}
          options={[['single', 'Single'], ['mfj', 'Married filing jointly'], ['hoh', 'Head of household']]} onChange={(v) => set({ filingStatus: v })} />
      </div>
    </>,
    <>
      <p className="muted">Yearly pay before taxes, in today's dollars. Leave a salary at 0 for someone without paid work.</p>
      {people.map(([k, title]) => (
        <div key={k} className="setupgroup">
          <h4>{title}</h4>
          <div className="grid">
            <Num label="Yearly salary" value={a[k].salary} step={1000} onChange={(v) => setPerson(k, { salary: v })} />
            <Num label="Share saved in a 401(k) or similar" value={a[k].contributionRate} percent onChange={(v) => setPerson(k, { contributionRate: v })} />
            <Num label="Employer match of each dollar" value={a[k].employerMatch} percent onChange={(v) => setPerson(k, { employerMatch: v })} />
            <Num label="Match applies up to this share of pay" value={a[k].matchLimit} percent onChange={(v) => setPerson(k, { matchLimit: v })} />
            <Num label="Age you plan to stop working" value={a[k].retirementAge} onChange={(v) => setPerson(k, { retirementAge: v })} />
            <Num label="Monthly Social Security at 67 (0 to estimate)" value={a[k].socialSecurity} step={50} onChange={(v) => setPerson(k, { socialSecurity: v })}
              hint="From your statement at ssa.gov, in today's dollars. At 0, Horizon estimates the benefit from a career at this salary." />
          </div>
        </div>
      ))}
    </>,
    <>
      <p className="muted">Balances today. Leave an account at 0 if you do not have one.</p>
      <div className="grid">
        <Num label="Checking and savings" value={a.cash} step={1000} onChange={(v) => set({ cash: v })} />
        <Num label="Taxable brokerage accounts" value={a.brokerage} step={1000} onChange={(v) => set({ brokerage: v })} />
        <Num label="Amount paid for those investments (0 if unknown)" value={a.brokerageBasis} step={1000} onChange={(v) => set({ brokerageBasis: v })}
          hint="The cost basis, which sets the taxable gain on a sale. At 0, Horizon assumes three quarters of the balance." />
        <Num label="Health savings account (HSA)" value={a.hsa} step={500} onChange={(v) => set({ hsa: v })} />
      </div>
      {people.map(([k, title]) => (
        <div key={k} className="setupgroup">
          <h4>{title}</h4>
          <div className="grid">
            <Num label="401(k), 403(b), and traditional IRA" value={a[k].traditional} step={1000} onChange={(v) => setPerson(k, { traditional: v })} />
            <Num label="Roth 401(k) and Roth IRA" value={a[k].roth} step={1000} onChange={(v) => setPerson(k, { roth: v })} />
          </div>
        </div>
      ))}
    </>,
    <>
      <Check label="I own my home" value={a.ownsHome} onChange={(v) => set({ ownsHome: v })} />
      {a.ownsHome && (
        <div className="grid">
          <Num label="Home value" value={a.homeValue} step={5000} onChange={(v) => set({ homeValue: v })} />
          <Num label="Mortgage balance" value={a.mortgageBalance} step={5000} onChange={(v) => set({ mortgageBalance: v })} />
          <Num label="Mortgage interest rate" value={a.mortgageRate} percent onChange={(v) => set({ mortgageRate: v })} />
          <Num label="Monthly payment (principal and interest)" value={a.mortgagePayment} step={50} onChange={(v) => set({ mortgagePayment: v })} />
        </div>
      )}
      <p className="muted">Other debts, such as student loans, car loans, and credit cards, added together.</p>
      <div className="grid">
        <Num label="Other debts, total balance" value={a.otherDebt} step={1000} onChange={(v) => set({ otherDebt: v })} />
        <Num label="Average interest rate" value={a.otherDebtRate} percent onChange={(v) => set({ otherDebtRate: v })} />
        <Num label="Monthly payments, total" value={a.otherDebtPayment} step={50} onChange={(v) => set({ otherDebtPayment: v })} />
      </div>
    </>,
    <>
      <p className="muted">Yearly spending on everything except {a.ownsHome ? 'the mortgage, ' : ''}debt payments and taxes: {a.ownsHome ? '' : 'rent, '}food, transport, insurance, travel, and the rest. A rough figure is fine.</p>
      <div className="grid">
        <Num label="Yearly living expenses" value={a.living} step={1000} onChange={(v) => set({ living: v })} />
        <Num label="Yearly Roth IRA contributions" value={a.rothIra} step={500} onChange={(v) => set({ rothIra: v })} />
        <Num label="Yearly HSA contributions" value={a.hsaContribution} step={500} onChange={(v) => set({ hsaContribution: v })} />
      </div>
    </>,
    <>
      <p className="muted">Check the summary, then create your plan. Every figure can be changed later on the plan's pages.</p>
      <table className="setupsummary">
        <tbody>
          {people.map(([k, title]) => (
            <tr key={k}><th>{title}</th><td>Age {age(a[k])}, salary {money(a[k].salary)}, stops working at {a[k].retirementAge}, Social Security {money(setupBenefit(a[k]))} a month at 67{a[k].socialSecurity > 0 ? '' : ' (estimated)'}</td></tr>
          ))}
          <tr><th>Taxes</th><td>{a.state}, {a.filingStatus === 'mfj' ? 'married filing jointly' : a.filingStatus === 'hoh' ? 'head of household' : 'single'}</td></tr>
          <tr><th>Savings</th><td>{money(a.cash + a.brokerage + a.hsa + people.reduce((s, [k]) => s + a[k].traditional + a[k].roth, 0))} across cash, brokerage, retirement accounts, and the HSA</td></tr>
          <tr><th>Home and debts</th><td>{a.ownsHome ? `Home ${money(a.homeValue)}, mortgage ${money(a.mortgageBalance)}` : 'No home owned'}{a.otherDebt > 0 ? `, other debts ${money(a.otherDebt)}` : ''}</td></tr>
          <tr><th>Spending</th><td>{money(a.living)} a year</td></tr>
        </tbody>
      </table>
    </>,
  ];
  const last = step === STEPS.length - 1;
  return (
    <div className="login setup">
      <form className="card" onSubmit={(e) => { e.preventDefault(); if (last) finish(planFromAnswers(a, year), true); else { setStep(step + 1); window.scrollTo(0, 0); } }}>
        <div className="brand"><div className="logo"><Icon name="trend" size={17} /></div>Welcome to Horizon</div>
        <div className="steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''} />)}
        </div>
        <h3>{step + 1}. {STEPS[step]}</h3>
        {body[step]}
        <div className="row setupnav">
          {step > 0 && <button type="button" className="ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="submit">{last ? 'Create my plan' : 'Next'}</button>
        </div>
        <button type="button" className="ghost" onClick={() => finish(examplePlan(), false)}>Skip the setup and explore an example plan</button>
        <p className="muted small">Horizon is an educational calculator, and it gives no financial advice.</p>
      </form>
    </div>
  );
}
