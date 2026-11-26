#!/bin/bash
set -euo pipefail
H=horizon-sync.horizon-sync.workers.dev
IP=$(curl -s -m 10 "https://cloudflare-dns.com/dns-query?name=$H&type=A" -H 'accept: application/dns-json' | grep -oE '"data":"[0-9.]+"' | head -1 | grep -oE '[0-9.]+')
curl -s -m 20 ${IP:+--resolve $H:443:$IP} -H "Authorization: Bearer $(cat ~/.config/horizon_admin_key)" https://$H/admin/stats | tr ',' '\n' | tr -d '{}"'
echo
