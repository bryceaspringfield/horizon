#!/usr/bin/env python3
"""The order in which Horizon adds each country's tax system (Bryce, 2026-11-23): the United States first, then the countries
ProjectionLab supports, in its tiers (full rules; income and wealth tax estimates; adjustable presets; from its help page
"Plan in other countries", updated Nov 18, 2026), then every other country by Internet users, most first. Three countries are not supported (EXCLUDED below).

Internet users = total population (World Bank indicator SP.POP.TOTL) x individuals using the Internet, % of population
(IT.NET.USER.ZS, which the World Bank takes from the ITU), each at its newest year with a value. Aggregates (regions, income
groups) are dropped by the World Bank's own region field. Downloads to 20_tax_rules/input/worldbank_<indicator>.json and
worldbank_countries.json; writes 20_tax_rules/output/country_order.csv.

  python3 20_tax_rules/code/22_country_order.py [--offline]
"""
import csv
import json
import os
import sys
import urllib.request

H = '/home/baspring/projects/independent/horizon/20_tax_rules'
API = 'https://api.worldbank.org/v2'
PL = [('US', 'the United States, first'),
      ('CA', 'ProjectionLab: full rules'), ('GB', 'ProjectionLab: full rules'), ('AU', 'ProjectionLab: full rules'),
      ('ES', 'ProjectionLab: tax estimates'), ('NL', 'ProjectionLab: tax estimates'),
      ('DE', 'ProjectionLab: preset'), ('CH', 'ProjectionLab: preset'), ('NO', 'ProjectionLab: preset'), ('BE', 'ProjectionLab: preset'),
      ('NZ', 'ProjectionLab: preset'), ('IL', 'ProjectionLab: preset'), ('SG', 'ProjectionLab: preset'), ('BR', 'ProjectionLab: preset'),
      ('CN', 'ProjectionLab: preset'), ('HK', 'ProjectionLab: preset')]
# Not supported (Bryce, 2026-11-23): "I will not support these due to serious human rights abuses including occupation, genocide,
# and ethnic cleansing." They keep a row, with no order, and Horizon builds no tax system for them.
EXCLUDED = {'IL': 'Israel', 'AE': 'the United Arab Emirates', 'RU': 'Russia'}
EXCLUDED_WHY = 'not supported: serious human rights abuses including occupation, genocide, and ethnic cleansing'
PL = [x for x in PL if x[0] not in EXCLUDED]


def fetch(path, name):
    f = f'{H}/input/{name}.json'
    if '--offline' not in sys.argv:
        rows, page = [], 1
        while True:
            with urllib.request.urlopen(f'{API}/{path}{"&" if "?" in path else "?"}format=json&per_page=20000&page={page}', timeout=120) as r:
                meta, data = json.load(r)
            rows += data or []
            if page >= meta['pages']:
                break
            page += 1
        json.dump(rows, open(f, 'w'))
    return json.load(open(f))


def newest(rows):
    out = {}
    for r in rows:
        if r['value'] is not None and (r['country']['id'] not in out or int(r['date']) > out[r['country']['id']][1]):
            out[r['country']['id']] = (r['value'], int(r['date']))
    return out


def main():
    countries = {c['iso2Code']: c for c in fetch('country', 'worldbank_countries') if c['region']['value'] != 'Aggregates'}
    pop = newest(fetch('country/all/indicator/SP.POP.TOTL?date=2015:2026', 'worldbank_SP.POP.TOTL'))
    net = newest(fetch('country/all/indicator/IT.NET.USER.ZS?date=2010:2026', 'worldbank_IT.NET.USER.ZS'))
    rows = []
    for iso, c in countries.items():
        p, n = pop.get(iso), net.get(iso)
        rows.append({'iso2': iso, 'country': c['name'], 'population': int(p[0]) if p else '', 'population_year': p[1] if p else '',
                     'internet_share_pct': round(n[0], 1) if n else '', 'internet_year': n[1] if n else '',
                     'internet_users': int(p[0] * n[0] / 100) if p and n else ''})
    first = {iso: (i, why) for i, (iso, why) in enumerate(PL)}
    rows.sort(key=lambda r: (r['iso2'] in EXCLUDED, first.get(r['iso2'], (len(PL),))[0], -(r['internet_users'] or 0), r['country']))
    for i, r in enumerate(rows):
        r['order'] = '' if r['iso2'] in EXCLUDED else i + 1
        r['basis'] = EXCLUDED_WHY if r['iso2'] in EXCLUDED else first[r['iso2']][1] if r['iso2'] in first else ('Internet users' if r['internet_users'] != '' else 'no Internet-use figure: last')
    os.makedirs(f'{H}/output', exist_ok=True)
    cols = ['order', 'iso2', 'country', 'basis', 'internet_users', 'population', 'population_year', 'internet_share_pct', 'internet_year']
    with open(f'{H}/output/country_order.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, cols); w.writeheader(); w.writerows({k: r[k] for k in cols} for r in rows)
    print(len(rows), 'countries;', sum(1 for r in rows if r['internet_users'] == ''), 'without an Internet-use figure')
    for r in rows[:40]:
        print(r['order'], r['iso2'], r['country'], '|', r['basis'], '|', f"{r['internet_users']:,}" if r['internet_users'] != '' else '', '|', r['internet_share_pct'], r['internet_year'])
    missing = [iso for iso in [x[0] for x in PL] + list(EXCLUDED) if iso not in countries]
    assert not missing, missing
    print('not supported:', [r['country'] for r in rows if r['order'] == ''])


if __name__ == '__main__':
    main()
