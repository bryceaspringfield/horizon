#!/bin/bash
set -euo pipefail
H=/home/baspring/projects/independent/horizon
export PATH=$HOME/.conda/envs/tools/bin:$PATH WRANGLER_SEND_METRICS=false
export CLOUDFLARE_API_TOKEN=$(cat ~/.config/cloudflare_workers_token)
export CLOUDFLARE_ACCOUNT_ID=$(cat ~/.config/cloudflare_account_id)
cd $H/40_sync_server/code
OUT=$(npx wrangler deploy 2>&1 | tee /dev/stderr)
URL=$(grep -oE 'https://horizon-sync\.[a-z0-9-]+\.workers\.dev' <<<"$OUT" | head -1)
[ -n "$URL" ] || { echo "no workers.dev address in the deploy output"; exit 1; }
curl -sf -X POST "$URL/salt" -H 'Content-Type: application/json' -d '{"username":"probe"}' >/dev/null && echo "server answers: $URL"
sed -i "s#?? '[^']*';#?? '$URL';#" $H/10_app/code/src/syncConfig.ts
grep -n "SYNC_URL" $H/10_app/code/src/syncConfig.ts
