#!/bin/bash
# Rebuilds everything in order: the tax rules, the market history, the app's tests, and the app.
set -euo pipefail
H=$(cd "$(dirname "$0")" && pwd)
PY=${PY:-python3}
(cd $H/20_tax_rules && $PY code/21_build_rules.py)
(cd $H/30_market_history && $PY code/31_build_returns.py)
(cd $H/10_app/code && npm ci && npm test && npm run build)
