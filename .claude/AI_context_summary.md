# Horizon: AI context summary

- Requested by Bryce on 2026-11-22: a local app with the features of ProjectionLab, on GitHub, every feature, US taxes only.
  Built as an original design and code base (no copy of ProjectionLab's branding or screens).
- Data stays in the browser (local storage, key `horizon-v1`); export and import as JSON. No server, no analytics.
- Tax rules are 2026's, indexed after 2026 by the plan's inflation. Sources: `.claude/context/sources.md`.
- Engine tests (`npm test`) check the 2026 tables against Rev. Proc. 2025-32's own figures; keep them passing.
