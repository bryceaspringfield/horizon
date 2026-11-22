# Horizon

A financial and retirement planner which runs in the browser: accounts, income, expenses, Social Security, milestones,
withdrawal and Roth conversion strategies, US federal and state taxes, year-by-year projections, cash-flow diagrams,
Monte Carlo and historical backtests, plan comparison, and progress tracking. Your data stays in your browser's
storage; nothing is sent to a server. Export and import move it as one JSON file.

## Layout

| Folder | What it holds |
|---|---|
| `10_app/code/` | The app (React, TypeScript, Vite, ECharts): `src/engine/` the model and its tests, `src/pages/` the screens |
| `20_tax_rules/` | 2026 federal rules (IRS Rev. Proc. 2025-32, 2025-19, retirement limits; SSA wage base and bend points) and 2026 state brackets (Tax Foundation), built into `output/federal.json` and `output/states.json` |
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
Social Security, state brackets, and the 10% early withdrawal penalty. Brackets and limits rise with inflation after 2026.

Not modeled: itemized deductions, credits, the AMT, local income taxes, IRMAA, and state taxes on capital gains alone.

## Run it locally

```
cd 10_app/code && npm install && npm run dev
```
