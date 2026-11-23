#!/usr/bin/env python3
"""Asks Qwen (the farm's qwen3.8-27b, 131,072-token context) at the highest reasoning effort (xhigh), six streamed
requests at once (a finished task's file is kept and skipped), for:
  1. errors in each engine file of the app (tax law, finance, and code), each with the exact lines and a fix;
  2. errors in each page file (wrong numbers, broken inputs, misleading labels);
  3. ProjectionLab features Horizon still lacks, from ProjectionLab's changelog (99_overall/input/projectionlab/);
  4. features ProjectionLab's users asked for (its archived request board, 637 suggestions and 37 planned items, with
     votes) which Horizon could build.
Writes 99_overall/output/qwen_review/<task>.md, one file a request, and requests.tsv (the parsed request board).

  python3 99_overall/code/93_qwen_review.py [TASK ...]
"""
import concurrent.futures as cf
import html
import os
import re
import sys

sys.path.insert(0, os.path.expanduser('~/.claude/skills/efficiency'))
import qwen_farm  # noqa: E402

H = '/home/baspring/projects/independent/horizon'
SRC = H + '/10_app/code/src'
PL = H + '/99_overall/input/projectionlab'
OUT = H + '/99_overall/output/qwen_review'
EFFORT = 'xhigh'   # the server's efforts: xhigh, medium, low (qwen_farm.effort_name maps 'high' to xhigh)
BUDGET = 40000
WORKERS = 6

SYSTEM = ('You are a senior engineer and a US personal-finance and tax expert (CFP, EA) reviewing Horizon, an open-source '
          'retirement and financial planning web app (React and TypeScript) modeled on ProjectionLab. Think carefully and '
          'at length before answering. Be concrete: quote the exact code you mean, and say what is wrong, why (cite the '
          'tax rule or the financial reasoning), and the exact fix. Report only real problems you are confident of; say '
          'so when a point is uncertain. Rules in force: 2026 and 2027 federal law after the 2025 act (OBBBA): $15M '
          'estate exemption, SALT cap $40,400 in 2026, the $6,000 senior deduction 2025-2028, QBI permanent.')


def read(path):
    return open(path, encoding='utf-8').read()


def board():
    """The request board's items: (list, votes, comments, title)."""
    rows = []
    for name, label in (('changemap_1252-suggestions.html', 'suggested'), ('changemap_1253-planned.html', 'planned')):
        t = read(os.path.join(PL, name))
        for card in re.findall(r'<div class="card card-wide".*?</div>\s*</div>', t, re.S):
            title = re.search(r'<div class="title">\s*(.*?)\s*</div>', card, re.S)
            counts = re.findall(r'fa-(thumbs-up|comment)"></i>\s*(\d+)', card)
            c = dict(counts)
            if title:
                rows.append((label, int(c.get('thumbs-up', 0)), int(c.get('comment', 0)), html.unescape(title.group(1)).strip()))
    rows.sort(key=lambda r: -r[1])
    with open(os.path.join(OUT, 'requests.tsv'), 'w') as f:
        f.write('list\tvotes\tcomments\ttitle\n')
        for r in rows:
            f.write('\t'.join(map(str, r)) + '\n')
    return rows


def code_block(path):
    rel = os.path.relpath(path, SRC)
    lines = read(path).splitlines()
    return f'=== {rel} ===\n' + '\n'.join(f'{i + 1:4d}  {l}' for i, l in enumerate(lines))


def tasks():
    types = code_block(SRC + '/engine/types.ts')
    readme = read(H + '/README.md')
    out = {}
    engine = ['simulate.ts', 'tax.ts', 'stateDeath.ts', 'montecarlo.ts', 'estate.ts', 'fire.ts', 'retirement.ts', 'optimize.ts', 'defaults.ts']
    for f in engine:
        out['engine_' + f.split('.')[0]] = (
            'Find every error in this engine file of Horizon: wrong tax or benefit rules, wrong financial logic (cash flow '
            'counted twice or never, inflation applied wrongly, a balance that can go negative, order-of-operations '
            'mistakes in the yearly loop), and plain code bugs. For each, give the line numbers, the wrong code, why it is '
            'wrong, and the corrected code. Then list the three most important missing behaviors of this file. The types '
            'and the README follow for context.\n\n' + readme + '\n\n' + types + '\n\n' + code_block(SRC + '/engine/' + f))
    for f in ['pages/Editors.tsx', 'pages/Analysis.tsx', 'pages/More.tsx', 'pages/Report.tsx', 'App.tsx', 'store.ts', 'vault.ts', 'useProjection.ts']:
        out['ui_' + os.path.basename(f).split('.')[0]] = (
            'Find every error in this page or app file of Horizon: numbers shown wrong (nominal against today\'s dollars, '
            'wrong totals), inputs which cannot be set or which save the wrong field, misleading labels, state bugs '
            '(stale memo dependencies, edits that do not persist), security mistakes in the vault, and accessibility or '
            'mobile problems. For each, give the line numbers, the wrong code, why, and the fix.\n\n' + types + '\n\n'
            + code_block(SRC + '/' + f))
    changelog = read(os.path.join(PL, 'changelog.txt'))
    out['missing_projectionlab'] = (
        'Below are Horizon\'s README (what it models) and its types, then ProjectionLab\'s full changelog through version '
        '5.0.0 (November 20, 2026). List every ProjectionLab feature Horizon lacks or covers only partly, most important '
        'first. For each: the feature, the changelog version that added it, what Horizon has today, and a concrete design '
        'for Horizon (types, engine steps, and UI). Leave out account linking to banks (Horizon is local-only), mobile apps, '
        'and non-US taxes.\n\n' + readme + '\n\n' + types + '\n\n=== ProjectionLab changelog ===\n' + changelog)
    # The same comparison as one table: the long answer above spends its budget on designs and reaches four features.
    out['missing_table'] = (
        'Below are Horizon\'s README (what it models) and its types, then ProjectionLab\'s full changelog. Go through the '
        'changelog version by version and list EVERY ProjectionLab feature, setting, chart, or option which Horizon lacks or '
        'covers only partly. Answer with one markdown table and nothing else: columns Feature | Changelog version | Horizon '
        'today (missing, or partial with the type field you saw) | Effort (S, M, L). One line a feature, no designs, no code. '
        'Aim for completeness: 60 rows or more if they exist. Check the types before calling something missing. Leave out '
        'bank linking, mobile apps, non-US taxes, billing, advisors, and employers.\n\n'
        + readme + '\n\n' + types + '\n\n=== ProjectionLab changelog ===\n' + changelog)
    reqs = board()
    listing = '\n'.join(f'[{l}, {v} votes, {c} comments] {t}' for l, v, c, t in reqs)
    out['user_requests'] = (
        'Below are Horizon\'s README and types, then every request ProjectionLab\'s users posted on its public request '
        'board (archived 2026), with votes. Pick the 25 requests which would help Horizon\'s users most (weigh votes, '
        'value, and effort; skip bank account linking and anything needing a server, since Horizon runs in the browser '
        'only), say for each whether Horizon already has it, and give a concrete design for Horizon (types, engine '
        'steps, and UI).\n\n' + readme + '\n\n' + types + '\n\n=== Requests ===\n' + listing)
    # ProjectionLab's help center (99_overall/input/projectionlab/layout/help_articles.txt, 179 pages, captured
    # 2026-11-23 by a headless browser), in parts which fit the context: every feature and setting Horizon lacks.
    help_path = os.path.join(PL, 'layout', 'help_articles.txt')
    if os.path.exists(help_path):
        arts = [x for x in read(help_path).split('\n\n===== ') if '/help/' in x[:120] and '/category/' not in x[:120]]
        parts, cur = [], ''
        for x in arts:
            if len(cur) + len(x) > 230000:
                parts.append(cur); cur = ''
            cur += '\n\n===== ' + x
        parts.append(cur)
        for i, part in enumerate(parts):
            out[f'layout_{i + 1}'] = (
                'Below are Horizon\'s README and types, then part of ProjectionLab\'s help center (each article describes '
                'a page, panel, setting, or workflow of the ProjectionLab app). Go through the articles one by one. For each, '
                'list every feature, input, setting, chart, table, or option the article describes which Horizon lacks or '
                'covers only partly, judged from the README and the types. Give the article, the item, Horizon\'s state '
                '(missing or partial, and why you think so), and a one-line design. Skip billing, advisors, employers, '
                'sign-in, non-US countries, and bank linking. End with the 15 most valuable gaps of this part, ranked.\n\n'
                + readme + '\n\n' + types + '\n\n=== ProjectionLab help center, part ' + str(i + 1) + ' ===' + part)
    # Every request with 5 or more votes (Bryce, 2026-11-23: implement all of them), sorted for the build queue, in parts of 75.
    five = [r for r in reqs if r[1] >= 5]
    for i in range(0, len(five), 75):
        part = '\n'.join(f'{i + j + 1}. [{v} votes] {t}' for j, (l, v, c, t) in enumerate(five[i:i + 75]))
        out[f'votes5_{i // 75 + 1}'] = (
            'Below are Horizon\'s README and types, then requests ProjectionLab\'s users posted on its request board, each with '
            '5 or more votes. For EVERY request, in the order given, write one table row and nothing else: columns # | Request | '
            'Votes | Horizon today (have, partial, missing, or out of scope) | Evidence (the type field or README phrase, or why '
            'out of scope) | What to build (one line, or a dash) | Effort (S, M, L). Out of scope means only: linking to banks or '
            'brokers, ProjectionLab\'s own billing, advisor, or employer tools, native mobile apps, or tax systems outside the US. '
            'Check the types carefully before writing missing. No text outside the table.\n\n'
            + readme + '\n\n' + types + '\n\n=== Requests ===\n' + part)
    # One ledger of every ProjectionLab feature Horizon still lacks (Bryce's goal, 2026-11-23: at least every feature ProjectionLab
    # has): each earlier comparison is re-read with today's types, and every gap still open becomes one tab-separated row.
    built = ('Built since those comparisons (do not list): a first-run setup wizard; sign-up choice of saving on the device or the server; an '
             'installable offline app; import from ProjectionLab; plan currency, per-item currencies, and exchange rates; the foreign earned '
             'income exclusion and foreign tax credit; RSU cliff; salary bonus rate; 401(k) Roth share; inflation-linked accounts; a later '
             'withdrawal order; capital loss carryforward; undo and redo.')
    # in chunks of about 24,000 characters at medium effort: whole files at xhigh came back empty, the budget spent on reasoning (2026-11-23)
    chunks = []
    for f in ('missing_table', 'layout_1', 'layout_2', 'layout_3'):
        path = os.path.join(OUT, f + '.md')
        if not os.path.exists(path): continue
        cur = ''
        for line in read(path).splitlines(keepends=True):
            if len(cur) + len(line) > 24000 and cur: chunks.append(cur); cur = ''
            cur += line
        if cur.strip(): chunks.append(cur)
    for n, chunk in enumerate(chunks):
        out[f'ledger_{n + 1:02d}'] = (
            'Below are Horizon\'s CURRENT types, then an earlier comparison of ProjectionLab with Horizon. Re-check every gap of the comparison '
            'against the current types. For each gap STILL open (missing or partial), write exactly one line of four fields separated by a TAB '
            'character and nothing else, no header, no numbering, no markdown: AREA<TAB>FEATURE<TAB>BUILD<TAB>EFFORT. AREA is one of: accounts, '
            'income, expenses, taxes, healthcare, social-security, strategy, withdrawals, milestones, events, real-estate, estate, monte-carlo, '
            'charts, tables, cash-flow, compare, progress, household, plans, settings, sharing, onboarding, other. FEATURE names the ProjectionLab '
            'feature in at most 14 words. BUILD says what to add to Horizon in at most 22 words, naming the type or field. EFFORT is S, M, or L. '
            'Merge duplicates into one line. Skip billing, advisor and employer tools, bank linking, sign-in, and tax systems outside the US. '
            + built + '\n\n' + types + '\n\n=== Earlier comparison ===\n' + chunk)
    return out


def run(name, prompt):
    reply = qwen_farm.ask_stream(prompt, SYSTEM, 'medium' if name.startswith('ledger_') else EFFORT, BUDGET)
    open(os.path.join(OUT, name + '.md'), 'w').write(f'# {name}\n\n{reply}\n')
    return name, len(reply)


def main():
    os.makedirs(OUT, exist_ok=True)
    todo = tasks()
    first = ['missing_projectionlab', 'user_requests']
    want = sys.argv[1:] or first + [n for n in todo if n not in first]
    want = [n for n in want if not os.path.exists(os.path.join(OUT, n + '.md'))]
    print(len(todo), 'tasks;', len(want), 'asked', flush=True)
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for f in cf.as_completed([ex.submit(run, n, todo[n]) for n in want]):
            name, n = f.result()
            print(name, n, 'chars', flush=True)


if __name__ == '__main__':
    main()
