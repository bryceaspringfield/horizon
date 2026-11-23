# 40_sync_server: Horizon's account server

A Cloudflare Worker (`code/worker.js`) with one SQLite-backed Durable Object holding every account: a username, the
account's salt, a hash of the authentication key the browser derives from the password, the plans sealed in the
browser with AES-256-GCM, and a version for each save. The server never receives a password or readable plans.

- Local run: `cd code && npx wrangler dev` (the check `99_overall/code/94_account_check.py` starts its own).
- Deploy: `bash code/deploy.sh`, with a Cloudflare API token holding "Workers Scripts: Edit" in
  `~/.config/cloudflare_workers_token` (mode 600). It writes the server's address into `10_app/code/src/syncConfig.ts`.
- Cost: the Workers free plan (100,000 requests a day; SQLite Durable Objects included).
