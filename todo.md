# Horizon: open tasks

Asked by Bryce on 2026-11-23, in the order to build.

- [ ] Native installers built by GitHub Actions (.exe, .dmg, AppImage, .apk), for people who prefer a download to the browser's Install button (the installable web app is live).
- [ ] Import from ProjectionLab: test with a real export file (the importer is live and reads the file's understood shape; ProjectionLab publishes no schema), and adjust field names where the report shows gaps.
- [ ] Non-US tax systems, each from its tax authority's published rates, with its account types: Canada (federal and provinces; RRSP, TFSA, FHSA, CPP and OAS), the United Kingdom (income tax, National Insurance, dividend and capital gains allowances; ISA, SIPP, State Pension), Australia (income tax, Medicare levy; superannuation, Age Pension), Germany, the Netherlands (box 1, 2, 3), and Spain; then a custom bracket model for any other country.
- [ ] Foreign earnings of US persons: the foreign earned income exclusion (section 911) with the housing exclusion, the foreign tax credit (section 901, general and passive baskets, carryover), and income taxed abroad in a foreign currency.
- [ ] ProjectionLab's request board: every request with 5 or more votes (225 of 674; sorted in `99_overall/output/qwen_review/votes5_*.md`), verified in the code, then built in vote order.
- [ ] ProjectionLab's help center (179 pages, `99_overall/input/projectionlab/layout/`) and changelog: every feature Horizon lacks (`99_overall/output/qwen_review/layout_*.md`, `missing_table.md`), verified, then built.
- [ ] Qwen's code review (`99_overall/output/qwen_review/engine_*.md`, `ui_*.md`): verify each finding in the code and fix the real ones; rerun the five long files (simulate, tax, estate, stateDeath, Editors) in pieces.
- [ ] Terms of Use: name a governing state and a contact address (Bryce's choice).

- [ ] Currencies: say "today's money" in place of "today's dollars" on every page for a plan in another currency (the top bar does already); a foreign debt's payment follows the exchange rate's yearly change.