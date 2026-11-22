# Horizon

A financial and retirement planner which runs in the browser: accounts, income, expenses, Social Security, milestones,
withdrawal and Roth conversion strategies, US federal and state taxes, year-by-year projections, cash-flow diagrams,
Monte Carlo and historical backtests, plan comparison, and progress tracking. Your data stays in your browser's
storage; nothing is sent to a server. Export and import move it as one JSON file.

## Layout

| Folder | What it holds |
|---|---|
| `10_app/code/` | The app (React, TypeScript, Vite, ECharts): `src/engine/` the model and its tests, `src/pages/` the screens |
| `20_tax_rules/` | 2026 and 2027 federal rules (IRS revenue procedures and notices; SSA wage base and bend points), 2026 state brackets (Tax Foundation), and Medicare, ACA, and SALT rules (CMS, IRS, HHS), built into `output/` |
| `30_market_history/` | Yearly S&P 500, 10-year Treasury, T-bill, and CPI returns 1928-2025 (Damodaran, NYU Stern), built into `output/returns.json` |
| `99_overall/` | Notes and documentation |

`run_all.sh` rebuilds the data, runs the tests, and builds the app. The sources and their addresses are in
`.claude/context/sources.md`.

## The model

Each year: incomes (salary with 401(k) deferrals and employer match), Social Security by claim age with the survivor
keeping the larger benefit, required minimum distributions, expenses and debt payments, IRA, Roth IRA, and HSA
contributions within the year's limits, Roth conversions filling a chosen bracket, then taxes and withdrawals solved
together in the chosen account order. Taxes: federal brackets, standard deduction (with the 65-and-over addition),
capital gains and qualified dividends stacked on ordinary income, the net investment income tax, FICA, taxation of
Social Security, state brackets, itemized deductions under the SALT cap, and the 10% early withdrawal penalty. Health:
Medicare Part B and D from 65 with IRMAA surcharges on income two years back, and ACA premiums less the premium tax
credit between retirement and 65. Social Security includes spousal and survivor benefits. Withdrawals follow a chosen
order or come from every account in proportion, with optional 0% capital gains harvesting. Each year uses the newest
published rules (2026 or 2027) indexed by inflation after them.

Not modeled: tax credits, the AMT, local income taxes, and state taxes on capital gains alone.

## Run it locally

```
cd 10_app/code && npm install && npm run dev
```
