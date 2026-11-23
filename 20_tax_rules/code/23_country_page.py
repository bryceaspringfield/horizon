#!/usr/bin/env python3
"""Writes the country order (20_tax_rules/output/country_order.csv, from 22_country_order.py) as one HTML page: a filter, a switch
between the adjusted order and Internet users alone, sortable columns, and the countries not supported in a list of their own.

  python3 20_tax_rules/code/23_country_page.py OUT.html
"""
import csv
import html
import sys
import time

rows = list(csv.DictReader(open('/home/baspring/projects/independent/horizon/20_tax_rules/output/country_order.csv')))
ok = [r for r in rows if r['order'] != '']; out = [r for r in rows if r['order'] == '']
by_users = {r['iso2']: i + 1 for i, r in enumerate(sorted([r for r in ok if r['internet_users'] != ''], key=lambda r: -int(r['internet_users'])))}
n = lambda v: f'{int(v):,}' if v != '' else ''
tr = ''.join(
    f"<tr><td class=r>{r['order']}</td><td class=r data-v='{by_users.get(r['iso2'], 9999)}'>{by_users.get(r['iso2'], '')}</td><td>{html.escape(r['country'])}</td><td>{r['iso2']}</td>"
    f"<td>{html.escape(r['basis'])}</td><td class=r data-v='{r['internet_users'] or 0}'>{n(r['internet_users'])}</td><td class=r data-v='{r['population'] or 0}'>{n(r['population'])}</td>"
    f"<td class=r>{r['population_year']}</td><td class=r data-v='{r['internet_share_pct'] or 0}'>{r['internet_share_pct']}{'%' if r['internet_share_pct'] != '' else ''}</td><td class=r>{r['internet_year']}</td></tr>"
    for r in ok)
page = '''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Horizon: country order for tax systems</title>
<style>
:root{--bg:#f4f6fa;--panel:#fff;--line:#dde3ec;--ink:#162033;--muted:#5d6b82;--accent:#3d5afe}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--panel:#111a2c;--line:#22304a;--ink:#e8eefb;--muted:#93a7c9;--accent:#7aa2ff}}
body{font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:var(--bg);color:var(--ink)}
main{max-width:1150px;margin:0 auto;padding:20px 16px 40px}h1{font-size:21px;margin:0 0 6px}h2{font-size:16px;margin:26px 0 6px}p{color:var(--muted);margin:0 0 10px;max-width:85ch}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 12px}
input{font:inherit;padding:8px 12px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--ink);width:min(340px,100%)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden}.seg button{font:inherit;padding:8px 14px;border:0;background:var(--panel);color:var(--muted);cursor:pointer}.seg button.on{background:var(--accent);color:#fff}
.wrap{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{position:sticky;top:0;background:var(--panel);cursor:pointer;font-size:13px;color:var(--muted)}th:hover{color:var(--accent)}.r{text-align:right}tr:last-child td{border-bottom:0}
</style></head><body><main>
<h1>Horizon: the order in which each country's tax system is added</h1>
<p>The United States comes first, then the countries ProjectionLab supports (in the tiers of its help page "Plan in other countries", updated November 18, 2026), then every other country by Internet users, most first.</p>
<p>Internet users = total population (World Bank indicator SP.POP.TOTL) times individuals using the Internet as a percentage of the population (IT.NET.USER.ZS), each at its newest year with a value. __N__ countries and territories; those with no Internet-use figure come last. Built __DATE__. The buttons switch between the adjusted order and Internet users alone, and a click on a column sorts by the column.</p>
<div class="bar"><input id="q" type="search" placeholder="Filter by country"><span class="seg"><button id="adj" class="on">Adjusted order</button><button id="users">By Internet users alone</button></span></div>
<div class="wrap"><table id="t"><thead><tr><th class=r>Order</th><th class=r title="Rank by Internet users alone, with no country placed ahead">Rank by users</th><th>Country</th><th>Code</th><th>Why here</th><th class=r>Internet users</th><th class=r>Population</th><th class=r>Year</th><th class=r>Share online</th><th class=r>Year</th></tr></thead><tbody>__ROWS__</tbody></table></div>
<h2>Not supported</h2>
<p>Horizon will not support the tax systems of __OUT__, by its author's decision, due to serious human rights abuses including occupation, genocide, and ethnic cleansing.</p>
</main><script>
const tb = document.querySelector('#t tbody'), rows = [...tb.rows];
document.getElementById('q').addEventListener('input', e => { const v = e.target.value.toLowerCase(); for (const r of rows) r.hidden = !r.cells[2].textContent.toLowerCase().includes(v); });
const val = (r, i) => { const c = r.cells[i]; return c.dataset.v !== undefined ? +c.dataset.v : (isNaN(+c.textContent) || c.textContent === '' ? c.textContent : +c.textContent); };
const sortBy = (i, d) => { rows.sort((a, b) => { const x = val(a, i), y = val(b, i); return (x > y ? 1 : x < y ? -1 : 0) * d; }); rows.forEach(r => tb.appendChild(r)); };
const A = document.getElementById('adj'), U = document.getElementById('users');
const mark = b => { A.className = b === A ? 'on' : ''; U.className = b === U ? 'on' : ''; };
A.onclick = () => { sortBy(0, 1); mark(A); }; U.onclick = () => { sortBy(1, 1); mark(U); };
let last = -1, dir = 1;
document.querySelectorAll('#t th').forEach((th, i) => th.addEventListener('click', () => { dir = last === i ? -dir : 1; last = i; sortBy(i, dir); mark(i === 0 && dir === 1 ? A : i === 1 && dir === 1 ? U : null); }));
</script></body></html>'''
names = [html.escape(r['country']) for r in out]
listed = ', '.join(names[:-1]) + ', and ' + names[-1] if len(names) > 2 else ' and '.join(names)
open(sys.argv[1], 'w').write(page.replace('__ROWS__', tr).replace('__N__', str(len(ok))).replace('__DATE__', time.strftime('%B %-d, %Y')).replace('__OUT__', listed))
print(len(ok), 'rows;', 'not supported:', listed)
