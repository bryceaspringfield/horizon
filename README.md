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

Each year: incomes (salary with 401(k) deferrals and employer match under one limit a person, RSU vesting, rent from
rental property, pensions), Social Security by claim age with spousal and survivor benefits, required minimum
distributions, inherited IRAs under the 10-year rule, 72(t) SEPP payments, expenses and debt payments (extra payments,
loan forgiveness), IRA, Roth IRA (income phase-out or backdoor), mega backdoor Roth, and HSA contributions within each
year's limits, Roth conversions filling a chosen bracket or of set amounts, 0% gain harvesting, then taxes and
withdrawals solved together, drawn in a chosen order or in proportion, optionally shielded under a bracket, the first
IRMAA tier, or the ACA credit limit. Leftover pay fills a cash reserve, then goes to investing or to paying debts down.
Scheduled transfers move money between accounts with the tax each move causes; qualified charitable distributions pay
charity from IRAs after 71; an HSA is tax-free only for healthcare (else income, plus 20% before 65). An account can
have its own return or pay its dividends out to cash. Incomes and expenses can change from a year on and can be entered
in future dollars.

Taxes: federal brackets, standard or itemized deductions (SALT cap) and the 2025-2028 deduction for people 65 and over,
capital gains and qualified dividends stacked on ordinary income, the AMT, NIIT, FICA, taxable Social Security, credits
(child tax credit with its refundable part, the $500 credit for other dependents, the American Opportunity credit, the
saver's credit, and the earned income credit), state brackets by the state of residence each year, Washington's capital
gains tax, local income taxes (New York City's brackets, or a flat rate on wages or income with city presets), the early
withdrawal penalty, the QBI deduction for self-employment, and the federal estate tax; or one flat rate on all income. Health: Medicare with IRMAA and ACA premiums less the credit. Each year
uses the newest published rules (2026 or 2027) indexed by inflation after them.

Life events: buying a home or a rental property, children (costs and college), career breaks, pay changes, moves
between states, inheritances, recurring purchases, and separation or divorce. Milestones can combine conditions and can trigger retirement.

Results: net worth, cash flow (Sankey), taxes with a single-year bracket view, Monte Carlo (random, historical blocks,
every historical start year), a crash stress test, FIRE metrics (lean, regular, fat, Coast FI), a strategy optimizer
(60 combinations of conversions, withdrawals, shields, and gain harvesting, ranked by net legacy or taxes), net legacy
after estate tax and heirs' income tax, plan comparison, a plot builder, progress tracking with CSV import, and a year
table with CSV export, and a printable plan report. One plan is the main plan: Horizon opens on it, compares
against it, and plans can follow its starting finances or keep custom starting conditions.

State estate (12 states and DC) and inheritance (5 states) taxes come from the Tax Foundation table of October 1, 2026, with the rate between each state's lowest and top rates taken to rise evenly. Not modeled: non-US tax systems (in `todo.md`).

## Run it locally

```
cd 10_app/code && npm install && npm run dev
```
