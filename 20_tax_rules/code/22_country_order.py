#!/usr/bin/env python3
"""The order in which Horizon adds each country's tax system (Bryce, 2026-11-23):
  1. the United States;
  2. the countries ProjectionLab supports, in its tiers (full rules; income and wealth tax estimates; adjustable presets; from its
     help page "Plan in other countries", updated Nov 18, 2026);
  3. Mexico and Argentina (Bryce's personal interest);
  4. every other country by Internet users, most first.
A dependency is part of its host country (MERGE: the US Virgin Islands in the United States, Hong Kong in China), where it becomes a
choice among the country's states, provinces, and territories; its people and Internet users count in the host's figures. Israel and
the West Bank and Gaza are one row, "Occupied Palestine" (Bryce's wording), in Israel's ProjectionLab tier.

Within a country, state and province taxes are added in the same order (SUBNATIONAL): the United States first, then the large
federations by Internet users.

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
      ('NZ', 'ProjectionLab: preset'), ('PS', 'ProjectionLab: preset (Israel)'), ('SG', 'ProjectionLab: preset'), ('BR', 'ProjectionLab: preset'),
      ('CN', 'ProjectionLab: preset (China and Hong Kong)')]
PRIORITY = [('MX', "Bryce's personal interest"), ('AR', "Bryce's personal interest")]
# A dependency or special region, and the country it is part of here. The World Bank lists each as an economy of its own.
MERGE = {'AS': 'US', 'GU': 'US', 'MP': 'US', 'PR': 'US', 'VI': 'US',
         'HK': 'CN', 'MO': 'CN',
         'BM': 'GB', 'VG': 'GB', 'KY': 'GB', 'GI': 'GB', 'TC': 'GB', 'IM': 'GB', 'JG': 'GB',
         'AW': 'NL', 'CW': 'NL', 'SX': 'NL',
         'PF': 'FR', 'NC': 'FR', 'MF': 'FR',
         'GL': 'DK', 'FO': 'DK',
         'IL': 'PS'}
RENAME = {'PS': 'Occupied Palestine'}
# Countries whose states or provinces levy or shape taxes of their own, in the order their subnational rules are added.
SUBNATIONAL = ['US', 'CN', 'IN', 'BR', 'ID', 'PK', 'MX', 'NG', 'DE', 'CA', 'AR', 'ES', 'AU', 'CH']


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
    unknown = [k for k in list(MERGE) + list(MERGE.values()) + [x[0] for x in PL + PRIORITY] + SUBNATIONAL if k not in countries]
    assert not unknown, unknown
    groups = {}
    for iso in countries:
        groups.setdefault(MERGE.get(iso, iso), []).append(iso)
    rows = []
    for host, members in groups.items():
        members.sort(key=lambda m: (m != host, countries[m]['name']))
        p = sum(pop[m][0] for m in members if m in pop)
        users = sum(pop[m][0] * net[m][0] / 100 for m in members if m in pop and m in net)
        # the share online of the members with both figures, and the host's own data years
        covered = sum(pop[m][0] for m in members if m in pop and m in net)
        rows.append({'iso2': host, 'country': RENAME.get(host, countries[host]['name']),
                     'includes': '; '.join(countries[m]['name'] for m in members if m != host or host in RENAME),
                     'population': int(p) if p else '', 'population_year': pop[host][1] if host in pop else '',
                     'internet_share_pct': round(100 * users / covered, 1) if covered else '', 'internet_year': net[host][1] if host in net else '',
                     'internet_users': int(users) if covered else '',
                     'subnational_order': SUBNATIONAL.index(host) + 1 if host in SUBNATIONAL else ''})
    first = {iso: (i, why) for i, (iso, why) in enumerate(PL + PRIORITY)}
    rows.sort(key=lambda r: (first.get(r['iso2'], (len(first),))[0], -(r['internet_users'] or 0), r['country']))
    for i, r in enumerate(rows):
        r['order'] = i + 1
        r['basis'] = first[r['iso2']][1] if r['iso2'] in first else ('Internet users' if r['internet_users'] != '' else 'no Internet-use figure: last')
    os.makedirs(f'{H}/output', exist_ok=True)
    cols = ['order', 'iso2', 'country', 'basis', 'internet_users', 'population', 'population_year', 'internet_share_pct', 'internet_year', 'includes', 'subnational_order']
    with open(f'{H}/output/country_order.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, cols); w.writeheader(); w.writerows({k: r[k] for k in cols} for r in rows)
    print(len(rows), 'countries (of', len(countries), 'World Bank economies);', sum(1 for r in rows if r['internet_users'] == ''), 'without an Internet-use figure')
    for r in rows[:24]:
        print(r['order'], r['iso2'], r['country'], '|', r['basis'], '|', f"{r['internet_users']:,}" if r['internet_users'] != '' else '', '|', r['internet_share_pct'], '|', r['includes'][:70])


if __name__ == '__main__':
    main()
