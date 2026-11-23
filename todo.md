# Horizon: open tasks

Asked by Bryce on 2026-11-23, in the order to build.

- [ ] Native installers built by GitHub Actions (.exe, .dmg, AppImage, .apk), for people who prefer a download to the browser's Install button (the installable web app is live).
- [ ] Import from ProjectionLab: test with a real export file (the importer is live and reads the file's understood shape; ProjectionLab publishes no schema), and adjust field names where the report shows gaps.
- [ ] Non-US tax systems, each from its tax authority's published rates, with its account types: Canada (federal and provinces; RRSP, TFSA, FHSA, CPP and OAS), the United Kingdom (income tax, National Insurance, dividend and capital gains allowances; ISA, SIPP, State Pension), Australia (income tax, Medicare levy; superannuation, Age Pension), Germany, the Netherlands (box 1, 2, 3), and Spain; then a custom bracket model for any other country.
- [ ] ProjectionLab's request board: every request with 5 or more votes (225 of 674; sorted in `99_overall/output/qwen_review/votes5_*.md`), verified in the code, then built in vote order.
- [ ] ProjectionLab's help center (179 pages, `99_overall/input/projectionlab/layout/`) and changelog: every feature Horizon lacks (`99_overall/output/qwen_review/layout_*.md`, `missing_table.md`), verified, then built.
- [ ] Qwen's code review (`99_overall/output/qwen_review/engine_*.md`, `ui_*.md`): verify each finding in the code and fix the real ones; rerun the five long files (simulate, tax, estate, stateDeath, Editors) in pieces.
- [ ] Terms of Use: name a governing state and a contact address (Bryce's choice).

- [ ] Currencies: say "today's money" in place of "today's dollars" on every page for a plan in another currency (the top bar does already); a foreign debt's payment follows the exchange rate's yearly change.
- [ ] Foreign earnings of US persons, the parts left: the higher housing caps of high-cost cities (IRS Notice, yearly), the credit under the AMT, and deductions tied to excluded pay; confirm the 2026 exclusion limit ($132,900) in Rev. Proc. 2025-32.
## Unusual money situations (Bryce, 2026-11-23)
- Bonuses and churning: credit card, bank, and brokerage opening bonuses with their spend or deposit requirement and payout date; referral bonuses; class action settlement payouts.
- Reimbursed expenses: the spending, the cash back earned on it, and the expected repayment date. HSA/FSA spending (FSA use-it-or-lose-it), and cash on hand as its own holding.
- Collectibles (plushes, cards, coins: 28% collectibles gain rate) and resellable items (bike, monitor) as assets with a value, yearly change, and sale year.
- Budgeting: monthly categories against the plan; reminders when essentials are missing (groceries, phone, rent or mortgage, glasses or contacts, health insurance).
- Estimates: pay by occupation, metro area, and experience (BLS OEWS); essential costs by place; a questionnaire on how the user wants to live, filling in income and expenses.
- Household changes: a partner moving in and sharing rent and essentials from a year; a parent moving nearby to a separate home, whose place-bound benefits (a county housing subsidy) end at the move, living on Social Security; support given to family.

## Cards, churning, credit, and deals (Bryce, 2026-11-23)
- Card rewards engine: cash back by spending category and overall, caps, and bonus rates which end on a date and fall to a lower rate; spending broken down by category.
- Card finder: a card catalog (cash back overall and by category, minimum rate filters, travel rewards, perks such as concierge, insurance, and hotel upgrades, APR, annual fee, credit needed, state limits); the card with the most added value given the user's cards and spending; options the user cannot get (state, credit score, issuer rules such as 5/24) filtered out.
- Churn planner from bankrewards.io's listings: bonuses with their requirements, deadlines, eligibility by state, and early-closure fees; a schedule which meets each requirement with planned spending and deposits.
- Credit scores: a projection from utilization, account age, inquiries, new accounts, and payment history; authorized users (the user on a parent's cards, a partner on the user's), and how each card plan changes the score.
- Spending savings: paying in another currency, retention offers when cancelling, browser coupons, cash-back portals which stack with card rewards (cashbackmonitor.com's offers).
- Purchase goals: a thing to buy (a laptop), saving up for it by a date, and the best deal under the user's filters, counting price errors, coupons, portal cash back, and card cash back.

## Statements, flows, and savings (Bryce, 2026-11-23)
- Statement upload: bank and card statements (CSV, OFX/QFX, PDF) parsed in the browser into a spending log, categorized (with the card categories), deduplicated, and summarized by month and category; how each category compares to the plan and where it can be cut.
- Flows: automatic transfers between accounts on a schedule, employer matches, and provider IRA matches (Robinhood, Webull) with their clawback if the money leaves within a holding period (Robinhood: 5 years).
- Shared costs: memberships a household can share (Amazon Prime household, family plans of streaming and phone), with the saving of one shared plan over separate ones.

## Pay and benefits follow-ups (Bryce, 2026-11-23)
- Social Security COLA from SSA's announcements: the announced rate for each year it is known (2.8% for 2026), the plan's inflation after; refreshed when SSA announces the next (October).
- Medicare premiums withheld from the Social Security check: the check shown net of Part B (and Part D where withheld), the premiums still counted once.

## Households and prefilled costs (Bryce, 2026-11-23)
- Households: each with a place and members over time (moves on dates or life events); shared costs scale with household size by an economies-of-scale rule, not per head; costs others pay count as zero for that person; children and pets add their own.
- Insurance coverage imported or prefilled: premiums, deductible, out-of-pocket maximum, copays, employer HSA money; employer presets (MIT's 2026 benefits first).
- Prefilled costs: tuition by university and program (College Scorecard), rent by metro (HUD fair market rents, Zillow ZORI), home prices (Zillow ZHVI), essentials by place. MIT Living Wage Calculator (livingwage.mit.edu) for yearly food, childcare, medical, housing, transportation, and other costs by county and household makeup.

## ProjectionLab parity from the live app (Bryce, 2026-11-23)
- Open ProjectionLab as a guest (Playwright) and record every screen, setting, and chart: tax-bracket optimization, drawdown order, gain harvesting, Roth conversions, flexible spending, tax strategy, estate planning, compare and what-if; build each one Horizon lacks.

## From ProjectionLab's screens (Bryce's screenshots, 2026-11-23)
- Metrics settings still open: what counts as spending, and how the effective tax rate is figured.
- Net worth history: tracked accounts by date with 1M, 3M, YTD, 1Y, 5Y, 10Y, and All ranges, the change since a date, and the composition bar (investable assets, liquid assets, liquid net worth).
- Rates as curves by age, edited point by point (the horizon bands drawn as a chart).
- Expense form: amount with a frequency (once, a month, a year), spender, timing, flexibility, and recurrence in one place.
