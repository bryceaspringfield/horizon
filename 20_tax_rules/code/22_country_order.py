#!/usr/bin/env python3
"""The order in which Horizon adds each country's tax system (Bryce, 2026-11-23):
  1. the United States;
  2. the countries ProjectionLab supports, in its tiers (full rules; income and wealth tax estimates; adjustable presets; from its
     help page "Plan in other countries", updated Nov 18, 2026);
  3. Mexico and Argentina (Bryce's personal interest);
  4. every other country by Internet users, most first.
Within each of these groups (each ProjectionLab tier apart), countries run by Internet users, most first. Norway alone leads its group (the presets)
ahead of that order (TIER_HEAD).
Taiwan, Hong Kong, and Macao are countries of their own here, and each is also a choice among China's regions, opening the same
settings (ALSO_UNDER); so are Artsakh under Azerbaijan and Transnistria under
Moldova. Breakaway and autonomous regions with no row of their own are regional choices too (REGIONS). A dependency is part of its host country (MERGE: the US Virgin Islands in the United States), where it becomes a
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
      ('CN', 'ProjectionLab: preset'), ('HK', 'ProjectionLab: preset')]
PRIORITY = [('MX', "Bryce's personal interest"), ('AR', "Bryce's personal interest")]
# A dependency or special region, and the country it is part of here. The World Bank lists each as an economy of its own.
MERGE = {'AS': 'US', 'GU': 'US', 'MP': 'US', 'PR': 'US', 'VI': 'US',
         'BM': 'GB', 'VG': 'GB', 'KY': 'GB', 'GI': 'GB', 'TC': 'GB', 'IM': 'GB', 'JG': 'GB',
         'AW': 'NL', 'CW': 'NL', 'SX': 'NL',
         'PF': 'FR', 'NC': 'FR', 'MF': 'FR',
         'GL': 'DK', 'FO': 'DK',
         'IL': 'PS'}
RENAME = {'PS': 'Occupied Palestine'}
# Common English names in place of the World Bank's forms (Bryce, 2026-11-23: "Somalia", "Laos", "Congo Republic", "D.R. Congo").
COMMON = {'RU': 'Russia', 'EG': 'Egypt', 'VN': 'Vietnam', 'IR': 'Iran', 'TR': 'Turkey', 'KR': 'South Korea', 'KP': 'North Korea', 'CD': 'D.R. Congo',
          'CG': 'Congo Republic', 'VE': 'Venezuela', 'CI': 'Ivory Coast', 'SY': 'Syria', 'YE': 'Yemen', 'KG': 'Kyrgyzstan', 'SO': 'Somalia', 'LA': 'Laos',
          'SK': 'Slovakia', 'GM': 'Gambia', 'BN': 'Brunei', 'CV': 'Cape Verde', 'BS': 'Bahamas', 'ST': 'São Tomé and Príncipe', 'LC': 'Saint Lucia',
          'VC': 'Saint Vincent and the Grenadines', 'KN': 'Saint Kitts and Nevis', 'FM': 'Micronesia', 'NR': 'Nauru', 'HK': 'Hong Kong', 'MO': 'Macao',
          'VI': 'U.S. Virgin Islands', 'PR': 'Puerto Rico', 'CW': 'Curaçao', 'MF': 'Saint Martin', 'SX': 'Sint Maarten', 'PS': 'Palestine (West Bank and Gaza)'}
# Other spellings and names a search accepts (the page's filter, and Horizon's country picker); the World Bank's own form and the
# names of the territories counted in a country are added to each row's list by the script.
ALIASES = {
    'US': 'USA; U.S.; U.S.A.; America; United States of America; the States', 'GB': 'UK; U.K.; Britain; Great Britain; England; Scotland; Wales; Northern Ireland',
    'NL': 'Holland; The Netherlands; Nederland', 'NO': 'Norge; Noreg', 'CN': "PRC; People's Republic of China; Mainland China; Zhongguo", 'BR': 'Brasil',
    'DE': 'Deutschland; Federal Republic of Germany', 'PS': 'Palestine; State of Palestine; Palestinian Territories; West Bank; Gaza; Israel; Filastin',
    'BE': 'Belgique; België; Belgien', 'CH': 'Schweiz; Suisse; Svizzera; Swiss Confederation', 'HK': 'Hongkong; Hong Kong SAR; HKSAR; Xianggang',
    'MO': 'Macau; Macao SAR; Aomen', 'NZ': 'Aotearoa; NZ', 'MX': 'México; Mejico', 'AR': 'Argentine Republic', 'IN': 'Bharat; Hindustan', 'RU': 'Russian Federation; Rossiya',
    'JP': 'Nippon; Nihon', 'EG': 'Misr; Arab Republic of Egypt', 'VN': 'Viet Nam', 'IR': 'Persia; Islamic Republic of Iran', 'PH': 'The Philippines; Pilipinas',
    'TR': 'Türkiye; Turkiye', 'TH': 'Siam', 'FR': 'République française', 'IT': 'Italia', 'ES': 'España; Espana', 'ZA': 'RSA; S. Africa',
    'KR': 'Korea; Republic of Korea; ROK; S. Korea; Hanguk', 'KP': "DPRK; N. Korea; Democratic People's Republic of Korea", 'SA': 'KSA; Saudi', 'DZ': 'Algérie',
    'MA': 'Maroc', 'UA': 'Ukraina', 'PL': 'Polska', 'MM': 'Burma', 'CD': 'DRC; DR Congo; Democratic Republic of the Congo; Congo-Kinshasa; Congo Kinshasa; Zaire',
    'CG': 'Republic of the Congo; Congo-Brazzaville; Congo Brazzaville; Congo', 'TZ': 'United Republic of Tanzania', 'VE': 'Bolivarian Republic of Venezuela',
    'TW': 'Republic of China; ROC; Chinese Taipei; Formosa', 'CI': "Côte d'Ivoire; Cote d'Ivoire", 'KH': 'Kampuchea', 'LK': 'Ceylon', 'AE': 'UAE; U.A.E.; Emirates',
    'SE': 'Sverige', 'CZ': 'Czech Republic; Cesko', 'SY': 'Syrian Arab Republic', 'BY': 'Byelorussia; Belorussia', 'AT': 'Österreich; Osterreich; Oesterreich',
    'KG': 'Kyrgyz Republic; Kirghizia', 'DK': 'Danmark', 'IE': 'Éire; Republic of Ireland', 'FI': 'Suomi', 'LA': "Lao; Lao People's Democratic Republic",
    'SK': 'Slovak Republic', 'GE': 'Sakartvelo', 'HR': 'Hrvatska', 'BA': 'Bosnia; Herzegovina; BiH', 'MD': 'Moldavia', 'MK': 'Macedonia; FYROM', 'GM': 'The Gambia',
    'SZ': 'Swaziland', 'TL': 'East Timor', 'BN': 'Brunei Darussalam', 'CV': 'Cabo Verde', 'BS': 'The Bahamas', 'ST': 'Sao Tome', 'FM': 'Federated States of Micronesia; FSM',
    'NR': 'Naoero', 'X-ART': 'Nagorno-Karabakh; Republic of Artsakh; Karabakh', 'X-TRN': 'Pridnestrovie; Transdniestria; PMR',
    'EH': 'Sahrawi Arab Democratic Republic; SADR; Sahrawi Republic', 'XK': 'Kosova', 'GR': 'Hellas; Ellada', 'HU': 'Magyarország', 'LB': 'Liban', 'TN': 'Tunisie',
    'EE': 'Eesti', 'LV': 'Latvija', 'LT': 'Lietuva', 'IS': 'Ísland', 'AL': 'Shqipëria', 'AM': 'Hayastan', 'ME': 'Crna Gora', 'RS': 'Srbija', 'SI': 'Slovenija',
    'CY': 'Kypros; Kibris; Northern Cyprus', 'PG': 'PNG', 'CF': 'CAR', 'TT': 'Trinidad; Tobago', 'AG': 'Antigua; Barbuda', 'KN': 'St Kitts; Saint Christopher and Nevis',
    'LC': 'St Lucia', 'VC': 'St Vincent', 'SO': 'Somali Republic; Federal Republic of Somalia', 'YE': 'Republic of Yemen', 'PT': 'Portugal', 'RO': 'Rumania',
    'SD': 'the Sudan', 'ET': 'Abyssinia', 'BJ': 'Dahomey', 'BF': 'Upper Volta', 'ZW': 'Rhodesia', 'BD': 'Bangla Desh', 'ID': 'Indonesia',
}
# Countries of their own here which are also offered among another country's regions, opening the same settings (Bryce, 2026-11-23).
# Western Sahara is no choice under Morocco, and no Moroccan-held part of it is offered anywhere (Bryce, 2026-11-23): its own row
# offers only the places the Sahrawi government administers (REGIONS).
# Kosovo is an independent country here, with no place among Serbia's regions (Bryce, 2026-11-23).
ALSO_UNDER = {'TW': 'CN', 'HK': 'CN', 'MO': 'CN', 'X-ART': 'AZ', 'X-TRN': 'MD'}
# Countries here which the World Bank does not list and for which no population or Internet figure is held: they come last until a
# source is added. Artsakh's government dissolved on 2024-01-01 after its people left in September 2023.
NO_FIGURES = {'EH': 'Western Sahara', 'X-ART': 'Artsakh', 'X-TRN': 'Transnistria'}
# Further regional choices under a recognized country (Bryce, 2026-11-23): breakaway and autonomous regions, and for Cyprus its
# first-level districts on both sides of the line, in place of a choice between the Republic of Cyprus and Northern Cyprus.
# Western Sahara: the seven municipalities of the zone the Sahrawi Arab Democratic Republic holds (the Free Zone, east of the berm), each
# also the seat of one of its seven military regions; the list is from Wikipedia's Free Zone article and wants an official SADR source.
# Somalia: the administrations which levy taxes in fact (Bryce, 2026-11-23): the five federal member states, the Banadir region
# (Mogadishu), Somaliland (self-declared independent since 1991, with a revenue system of its own), and the North Eastern State
# (SSC-Khatumo, formed in 2025; its standing wants a check against a current official source).
REGIONS = {'GE': ['Abkhazia', 'South Ossetia'],
           'SO': ['Puntland', 'Jubaland', 'South West State', 'Galmudug', 'Hirshabelle', 'Banadir (Mogadishu)', 'Somaliland', 'North Eastern State (SSC-Khatumo)'],
           'EH': ['Tifariti', 'Bir Lehlou', 'Agounit', 'Dougaj', 'Meharrize', 'Mijek', 'Zug (the seven municipalities the Sahrawi government administers; no Moroccan-held area is offered)'],
           'CY': ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta (these five de facto the Republic of Cyprus)',
                  'Lefkoşa', 'Gazimağusa', 'Girne', 'Güzelyurt', 'İskele', 'Lefke (these six de facto Northern Cyprus)']}
# The World Bank publishes no figures for Taiwan. Population: Ministry of the Interior, household registration, end of April 2025
# (https://www.moi.gov.tw/english/News_Content.aspx?n=7627&s=327851). Internet use: Ministry of Digital Affairs, 2025 Digital Access
# Survey, individuals with Internet access (https://moda.gov.tw/en/press/press-releases/18674).
EXTRA = {'TW': {'name': 'Taiwan', 'population': 23365274, 'population_year': 2025, 'internet_share_pct': 90.3, 'internet_year': 2025}}
# Countries whose states or provinces levy or shape taxes of their own, in the order their subnational rules are added.
SUBNATIONAL = ['US', 'CN', 'IN', 'BR', 'ID', 'PK', 'MX', 'NG', 'DE', 'CA', 'AR', 'ES', 'AU', 'CH']


# More search names (Bryce, 2026-11-23): abbreviations (one may name several countries: ROC, SAR), names in the country's own
# languages and scripts, and outdated names. Three-letter codes come from the World Bank's list.
ALIASES_MORE = {
    'US': 'US', 'GB': 'United Kingdom of Great Britain and Northern Ireland; GBR', 'CN': '中国; 中國; Zhonghua', 'JP': '日本', 'KR': '한국; 대한민국; Daehan Minguk',
    'KP': '조선; Choson; Joseon', 'TW': '台灣; 臺灣; 台湾; 中華民國; Zhonghua Minguo', 'HK': '香港; Heung Gong; SAR', 'MO': '澳門; 澳门; Ou Mun; SAR', 'IN': 'भारत; Republic of India',
    'PK': 'پاکستان; West Pakistan', 'BD': 'বাংলাদেশ; East Pakistan; East Bengal', 'RU': 'Россия; RF; Soviet Union; USSR', 'UA': 'Україна; Ukrayina; the Ukraine', 'BY': 'Беларусь; White Russia',
    'EG': 'مصر; Masr', 'SA': 'السعودية; Al Saudiyah; Kingdom of Saudi Arabia', 'AE': 'الإمارات; Al Imarat; Trucial States', 'IQ': 'العراق; Al Iraq; Mesopotamia',
    'SY': 'سوريا; Suriyah; SAR', 'JO': 'الأردن; Al Urdun; Transjordan', 'LB': 'لبنان; Lubnan', 'MA': 'المغرب; Al Maghrib', 'DZ': 'الجزائر; Al Jazair', 'TN': 'تونس', 'LY': 'ليبيا; Libiya',
    'SD': 'السودان', 'YE': 'اليمن; Al Yaman', 'OM': 'عمان', 'QA': 'قطر', 'KW': 'الكويت', 'BH': 'البحرين', 'PS': 'فلسطين; ישראל; Yisrael; Holy Land', 'GR': 'Ελλάδα; Hellenic Republic',
    'CY': 'Κύπρος; Kıbrıs', 'TH': 'ประเทศไทย; Prathet Thai', 'VN': 'Việt Nam', 'KH': 'កម្ពុជា', 'LA': 'ລາວ; Lao P.D.R.', 'MM': 'မြန်မာ; Myanma', 'NP': 'नेपाल', 'LK': 'ශ්‍රී ලංකා; இலங்கை; Ilankai',
    'AF': 'افغانستان', 'KZ': 'Қазақстан; Qazaqstan', 'UZ': 'Oʻzbekiston; Ozbekiston', 'KG': 'Кыргызстан', 'TJ': 'Тоҷикистон; Tojikiston', 'TM': 'Türkmenistan; Turkmenia', 'MN': 'Монгол; Mongol Uls',
    'GE': 'საქართველო', 'AM': 'Հայաստան', 'AZ': 'Azərbaycan; Azerbaycan', 'ET': 'ኢትዮጵያ; Ityopya', 'ER': 'ኤርትራ; Ertra', 'SO': 'Soomaaliya', 'MG': 'Madagasikara; Malagasy Republic',
    'CZ': 'Česko; Česká republika; Czechoslovakia; Bohemia', 'SK': 'Slovensko; Czechoslovakia', 'RO': 'România', 'BG': 'България; Bulgariya', 'RS': 'Србија; Yugoslavia', 'BA': 'Bosna i Hercegovina',
    'MK': 'Северна Македонија; Severna Makedonija', 'LU': 'Lëtzebuerg; Luxemburg', 'MD': 'Republica Moldova', 'PE': 'Perú', 'HT': 'Haïti; Ayiti', 'DO': 'República Dominicana; DR; Dom Rep',
    'PA': 'Panamá', 'FJ': 'Viti', 'PW': 'Belau', 'MH': 'RMI', 'MV': 'Dhivehi Raajje; Maldive Islands', 'BT': 'Druk Yul', 'GQ': 'Guinea Ecuatorial',
    'CF': 'Centrafrique; République centrafricaine; Ubangi-Shari', 'CM': 'Cameroun; Kamerun', 'TD': 'Tchad', 'SN': 'Sénégal', 'BJ': 'Bénin', 'GN': 'Guinée; Guinea-Conakry', 'ML': 'French Sudan',
    'CD': 'République démocratique du Congo; RDC; Democratic Republic of Congo; D.R.C.; Belgian Congo; Congo Free State', 'CG': 'ROC; République du Congo; French Congo; Middle Congo',
    'KM': 'Comores; Komori', 'MR': 'Mauritanie; موريتانيا', 'MU': 'Maurice', 'MZ': 'Moçambique', 'ZA': 'Suid-Afrika; Mzansi; Republic of South Africa', 'SZ': 'eSwatini; Kingdom of Eswatini',
    'GH': 'Gold Coast', 'TZ': 'Tanganyika; Zanzibar', 'MW': 'Nyasaland', 'BW': 'Bechuanaland', 'LS': 'Basutoland', 'ZM': 'Northern Rhodesia', 'ZW': 'Southern Rhodesia', 'NA': 'South West Africa; Namibië',
    'BZ': 'British Honduras', 'GY': 'British Guiana', 'SR': 'Dutch Guiana; Surinam', 'VU': 'New Hebrides', 'TV': 'Ellice Islands', 'KI': 'Gilbert Islands', 'WS': 'Western Samoa; Sāmoa',
    'MY': 'Malaya', 'EH': 'Spanish Sahara; الصحراء الغربية; Sahara Occidental', 'VC': 'SVG', 'KN': 'SKN', 'TT': 'T&T; TnT', 'PH': 'Republic of the Philippines',
    'ID': 'Dutch East Indies; Republik Indonesia', 'TR': 'Republic of Türkiye; Ottoman Empire', 'IR': 'ایران; Islamic Republic', 'TL': 'Timor Lorosae; Portuguese Timor', 'BN': 'Negara Brunei Darussalam',
    'TG': 'Togoland', 'BF': 'Burkina', 'CV': 'Cape Verde Islands', 'ST': 'Sao Tome and Principe; STP', 'GW': 'Guiné-Bissau; Portuguese Guinea', 'AO': 'Portuguese West Africa', 'DJ': 'French Somaliland; Jabuuti',
    'IS': 'Island', 'AT': 'Republik Österreich', 'DE': 'BRD; West Germany', 'ES': 'Reino de España', 'PT': 'República Portuguesa', 'IE': 'Eire; Irish Republic',
    'X-ART': 'Արցախ; NKR', 'X-TRN': 'Приднестровье; Pridnestrovian Moldavian Republic', 'XK': 'Republic of Kosovo; Kosovë', 'SS': 'Republic of South Sudan',
    'AG': 'Antigua & Barbuda', 'BS': 'Commonwealth of the Bahamas', 'NR': 'Pleasant Island', 'TO': 'Friendly Islands', 'AD': 'Andorre', 'MC': 'Múnegu',
}

# Countries placed at the head of their group, ahead of the group's order by Internet users (Bryce, 2026-11-23: Norway leads the
# presets, for a friend in Norway to try Horizon).
TIER_HEAD = {'NO': 'placed first among the presets (Bryce)'}

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
    for iso, c in countries.items():  # the common name shown, the World Bank's form kept for the search
        c['wb'] = c['name']; c['name'] = COMMON.get(iso, c['name'])
    for iso, x in EXTRA.items():
        countries[iso] = {'name': x['name']}; pop[iso] = (x['population'], x['population_year']); net[iso] = (x['internet_share_pct'], x['internet_year'])
    for iso, name in NO_FIGURES.items():
        countries[iso] = {'name': name}
    unknown = [k for k in list(MERGE) + list(MERGE.values()) + [x[0] for x in PL + PRIORITY] + SUBNATIONAL + list(ALSO_UNDER) + list(ALSO_UNDER.values()) + list(REGIONS) if k not in countries]
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
                     'subnational_order': SUBNATIONAL.index(host) + 1 if host in SUBNATIONAL else '',
                     'note': '; '.join(x for x in (
                         'Also a regional choice under ' + countries[ALSO_UNDER[host]]['name'] + ', opening the same settings' if host in ALSO_UNDER else '',
                         'Regional choices with settings of their own: ' + ', '.join(sorted(RENAME.get(k, countries[k]['name']) for k, v in ALSO_UNDER.items() if v == host))
                         if host in ALSO_UNDER.values() else '',
                         'Regional choices: ' + ', '.join(REGIONS[host]) if host in REGIONS else '',
                         "figures from Taiwan's ministries (the World Bank has none)" if host in EXTRA else '',
                         'no population or Internet figure held yet' if host in NO_FIGURES else '') if x)})
    # the tiers in order (the United States, ProjectionLab's three, Bryce's two, the rest); within a tier, Internet users, most first
    tiers = ['the United States, first', 'ProjectionLab: full rules', 'ProjectionLab: tax estimates', 'ProjectionLab: preset', "Bryce's personal interest"]
    first = {iso: (next(i for i, t in enumerate(tiers) if why.startswith(t)), why) for iso, why in PL + PRIORITY}
    rows.sort(key=lambda r: (first.get(r['iso2'], (len(tiers),))[0], r['iso2'] not in TIER_HEAD, -(r['internet_users'] or 0), r['country']))
    for r in rows:
        if r['iso2'] in TIER_HEAD: r['note'] = '; '.join(x for x in (r.get('note', ''), TIER_HEAD[r['iso2']]) if x)
    for i, r in enumerate(rows):
        r['order'] = i + 1
        r['basis'] = first[r['iso2']][1] if r['iso2'] in first else ('Internet users' if r['internet_users'] != '' else 'no Internet-use figure: last')
    os.makedirs(f'{H}/output', exist_ok=True)
    for r in rows:  # every other spelling a search accepts: the listed ones, the World Bank's forms, and the territories counted in the row
        ms = [m for m in countries if m == r['iso2'] or MERGE.get(m) == r['iso2']]
        al = [a for m in [r['iso2']] + ms for d in (ALIASES, ALIASES_MORE) for a in d.get(m, '').split('; ') if a]
        al += [countries[m]['id'] for m in ms if len(countries[m].get('id', '')) == 3]
        al += [x for m in ms for x in (countries[m]['name'], countries[m].get('wb', '')) if x]
        r['aliases'] = '; '.join(dict.fromkeys(a for a in al if a != r['country']))
    cols = ['order', 'iso2', 'country', 'basis', 'internet_users', 'population', 'population_year', 'internet_share_pct', 'internet_year', 'includes', 'subnational_order', 'note', 'aliases']
    with open(f'{H}/output/country_order.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, cols); w.writeheader(); w.writerows({k: r[k] for k in cols} for r in rows)
    print(len(rows), 'countries (from', len(countries) - len(EXTRA) - len(NO_FIGURES), 'World Bank economies and', len(EXTRA) + len(NO_FIGURES), 'added);', sum(1 for r in rows if r['internet_users'] == ''), 'without an Internet-use figure')
    for r in rows[:24]:
        print(r['order'], r['iso2'], r['country'], '|', r['basis'], '|', f"{r['internet_users']:,}" if r['internet_users'] != '' else '', '|', r['internet_share_pct'], '|', r['includes'][:70])


if __name__ == '__main__':
    main()
