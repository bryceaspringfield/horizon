#!/usr/bin/env python3
"""Writes the country order (20_tax_rules/output/country_order.csv, from 22_country_order.py) as one HTML page: a filter, sortable columns, each country's flag (flagcdn.com), the territories counted in
a country, and the order in which state and province taxes are added.

  python3 20_tax_rules/code/23_country_page.py OUT.html
"""
import csv
import html
import sys
import time

rows = list(csv.DictReader(open('/home/baspring/projects/independent/horizon/20_tax_rules/output/country_order.csv')))
ok = rows
by_users = {r['iso2']: i + 1 for i, r in enumerate(sorted([r for r in ok if r['internet_users'] != ''], key=lambda r: -int(r['internet_users'])))}
# a flat flag for a two-letter code from flagcdn.com (its w40 and w80 files; the 20x15 files are the waving style), cropped to 20 by 15; Artsakh's and Transnistria's from Wikimedia Commons (Flag_of_Artsakh.svg,
# Flag_of_Transnistria_(state).svg), as PNG files kept in the page's own folder
LOCAL_FLAG = {'X-ART': 'artsakh', 'X-TRN': 'transnistria'}
flag = lambda c: (f"<img class=f loading=lazy alt='' width=20 height=15 src='https://flagcdn.com/w40/{c.lower()}.png' srcset='https://flagcdn.com/w80/{c.lower()}.png 2x'>"
                  if len(c) == 2 else f"<img class=f loading=lazy alt='' width=20 height=15 style='object-fit:cover' src='{LOCAL_FLAG[c]}_40.png' srcset='{LOCAL_FLAG[c]}_80.png 2x'>")
nth = lambda v: '' if v == '' else v + ('th' if v[-2:] in ('11', '12', '13') else {'1': 'st', '2': 'nd', '3': 'rd'}.get(v[-1], 'th'))
import re, unicodedata
def norm(t):
    """Lower case, accents dropped, punctuation as spaces: the form the filter compares in."""
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if not unicodedata.category(c).startswith('M')).lower()
    return re.sub(r'[\W_]+', ' ', t).strip()
def keys(r):
    """Every spelling of a row for the filter: each as typed with spaces and run together ("u s a" and "usa"), joined by bars."""
    names = [r['country'], r['iso2'] if len(r['iso2']) == 2 else ''] + r['aliases'].split('; ') + r['includes'].split('; ')
    spell = set()
    for x in names:
        v = norm(x)
        if not v: continue
        # Saint and St, with and without "and" and "the": every such form of a name is accepted
        vs = {v, re.sub(r'\bsaint\b', 'st', v), re.sub(r'\bst\b', 'saint', v)}
        vs |= {re.sub(r'\band\b', ' ', w) for w in vs}
        vs |= {re.sub(r'\bthe\b', ' ', w) for w in vs}
        spell |= {' '.join(w.split()) for w in vs}
    forms = dict.fromkeys(f for v in sorted(spell) for f in (v, v.replace(' ', '')))
    return '|' + '|'.join(forms) + '|'
n = lambda v: f'{int(v):,}' if v != '' else ''
tr = ''.join(
    f"<tr data-s='{keys(r)}'><td class=r>{r['order']}</td><td class=r data-v='{by_users.get(r['iso2'], 9999)}'>{by_users.get(r['iso2'], '')}</td><td>{flag(r['iso2'])}{html.escape(r['country'])}</td><td>{r['iso2'] if len(r['iso2']) == 2 else ''}</td>"
    f"<td>{html.escape(r['basis'])}</td><td class=r data-v='{r['internet_users'] or 0}'>{n(r['internet_users'])}</td><td class=r data-v='{r['population'] or 0}'>{n(r['population'])}</td>"
    f"<td class=r data-v='{r['subnational_order'] or 9999}'>{nth(r['subnational_order'])}</td><td class=w>{html.escape('. '.join(x for x in (r['includes'], r['note']) if x))}</td></tr>"
    for r in ok)
page = '''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Horizon: country order for tax systems</title>
<style>
:root{--bg:#f4f6fa;--panel:#fff;--line:#dde3ec;--ink:#162033;--muted:#5d6b82;--accent:#3d5afe}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--panel:#111a2c;--line:#22304a;--ink:#e8eefb;--muted:#93a7c9;--accent:#7aa2ff}}
body{font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:var(--bg);color:var(--ink)}
main{max-width:1500px;margin:0 auto;padding:20px 16px 40px}h1{font-size:21px;margin:0 0 6px}h2{font-size:16px;margin:26px 0 6px}p{color:var(--muted);margin:0 0 10px;max-width:85ch}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 12px}
input{font:inherit;padding:8px 12px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--ink);width:min(340px,100%)}
.wrap{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{position:sticky;top:0;background:var(--panel);cursor:pointer;font-size:13px;color:var(--muted)}th:hover{color:var(--accent)}.r{text-align:right}.f{vertical-align:-3px;margin-right:8px;border-radius:3px;box-shadow:0 0 0 1px var(--line);object-fit:cover}.w{white-space:normal;min-width:220px;color:var(--muted);font-size:13px}tr:last-child td{border-bottom:0}
</style></head><body><main>
<h1>Horizon: the order in which each country's tax system is added</h1>
<p>A dependency is counted in its host country, where it becomes a choice among the country's states, provinces, and territories.</p>
<p>Internet users = total population (World Bank indicator SP.POP.TOTL) times individuals using the Internet as a percentage of the population (IT.NET.USER.ZS), each at its newest year with a value. __N__ countries and territories; those with no Internet-use figure come last. Built __DATE__. A click on a column heading sorts by the column. The search box accepts abbreviations (UK, DRC, UAE), names in a country's own language (Deutschland, 日本), older names (Burma, Zaire), and any punctuation, spacing, or accents and the territories counted in a country (Puerto Rico).</p>
<div class="bar"><input id="q" type="search" placeholder="Find a country, by any name or spelling"></div>
<div class="wrap"><table id="t"><thead><tr><th class=r>Order</th><th class=r title="Rank by Internet users alone, with no country placed ahead">Rank by users</th><th>Country</th><th>Code</th><th>Why here</th><th class=r>Internet users</th><th class=r>Population</th><th class=r title="The order in which the country's regional taxes are added">Order for subnational tax</th><th>Counted in the country, and notes</th></tr></thead><tbody>__ROWS__</tbody></table></div>
<h2>Subnational tax</h2>
<p>The column "Order for subnational tax" is a place in line, and it is no count of regions. It covers every country with regional taxes to build or with regional choices listed here. The United States is 1st (all 50 states, the District of Columbia, and the territories), Norway 2nd, China 3rd, and Spain 4th; the others follow by Internet users, most first.</p>
</main><script>
const tb = document.querySelector('#t tbody'), rows = [...tb.rows];
const norm = t => t.normalize('NFD').replace(/\\p{M}/gu, '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
const rank = (s, v, c) => s.includes('|' + v + '|') || s.includes('|' + c + '|') ? 0 : s.includes('|' + v) || s.includes('|' + c) ? 1 : s.includes(v) || s.includes(c) ? 2 : 9;
document.getElementById('q').addEventListener('input', e => {
  const v = norm(e.target.value), c = v.replace(/ /g, '');
  for (const r of rows) { r._k = v === '' ? 0 : rank(r.dataset.s, v, c); r.hidden = r._k === 9; }
  [...rows].sort((a, b) => a._k - b._k || +a.cells[0].textContent - +b.cells[0].textContent).forEach(r => tb.appendChild(r));
});
const val = (r, i) => { const c = r.cells[i]; return c.dataset.v !== undefined ? +c.dataset.v : (isNaN(+c.textContent) || c.textContent === '' ? c.textContent : +c.textContent); };
const sortBy = (i, d) => { rows.sort((a, b) => { const x = val(a, i), y = val(b, i); return (x > y ? 1 : x < y ? -1 : 0) * d; }); rows.forEach(r => tb.appendChild(r)); };
let last = -1, dir = 1;
document.querySelectorAll('#t th').forEach((th, i) => th.addEventListener('click', () => { dir = last === i ? -dir : 1; last = i; sortBy(i, dir); }));
</script></body></html>'''
open(sys.argv[1], 'w').write(page.replace('__ROWS__', tr).replace('__N__', str(len(ok))).replace('__DATE__', time.strftime('%B %-d, %Y')))
print(len(ok), 'rows')
