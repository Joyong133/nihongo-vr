#!/usr/bin/env python3
"""Build the level data files for the Nihongo VR app.

Sources (downloaded into tools/.cache on first run):
  - kanji-data (KANJIDIC-derived, JLPT levels from Jonathan Waller's lists)
  - open-anki-jlpt-decks (JLPT N5-N1 vocabulary, MIT)
  - wordfreq (word frequencies, used only to order words most-useful-first)

Hand-written content lives in content/ (Korean 훈음 for every kanji,
Korean glosses, grammar, reading, listening, verbs). Output: public/data/{n5..n1}.json
"""
import csv
import glob
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CACHE = os.path.join(os.path.dirname(__file__), '.cache')
CONTENT = os.path.join(ROOT, 'content')
OUT = os.path.join(ROOT, 'public', 'data')

SOURCES = {
    'kanji.json': 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json',
    'kanji-jouyou.json': 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji-jouyou.json',
}
for n in ('n5', 'n4', 'n3', 'n2', 'n1'):
    SOURCES[f'{n}.csv'] = f'https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/{n}.csv'

LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1']
LEVEL_NUM = {'n5': 5, 'n4': 4, 'n3': 3, 'n2': 2, 'n1': 1}


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('download', SOURCES[name], file=sys.stderr)
        urllib.request.urlretrieve(SOURCES[name], path)
    return path


def is_kanji(ch):
    return '一' <= ch <= '鿿' or ch in '々〆ヶ'


# ---------------------------------------------------------------- kanji
def load_kanji_ko():
    out = {}
    # hand-curated 대표 훈음 (content/kanji_ko)
    for path in sorted(glob.glob(os.path.join(CONTENT, 'kanji_ko', '*.txt'))):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                ch, m = line[0], line[1:].strip()
                out[ch] = m
    return out


def build_kanji():
    data = json.load(open(fetch('kanji.json'), encoding='utf-8'))
    jouyou = json.load(open(fetch('kanji-jouyou.json'), encoding='utf-8'))
    ko = load_kanji_ko()
    levels = {n: [] for n in LEVELS}
    for ch, v in data.items():
        lv = v.get('jlpt_new')
        grade = v.get('grade') or 0
        if lv and grade <= 8:
            level = f'n{lv}'
        elif ch in jouyou:
            # jouyou kanji missing from the JLPT lists: place by school grade
            level = 'n5' if ch in '分' else 'n4' if grade <= 2 else 'n3' if grade <= 4 else 'n2' if grade <= 6 else 'n1'
        else:
            continue
        en = [m for m in v.get('meanings') or [] if 'radical' not in m.lower()][:3]
        levels[level].append({
            'c': ch,
            'ko': ko.get(ch, ''),
            'en': ', '.join(en).lower(),
            'on': [r for r in v.get('readings_on') or []][:4],
            'kun': [r for r in v.get('readings_kun') or []][:4],
            's': v.get('strokes') or 0,
            'f': v.get('freq') or 9999,
        })
    for n in LEVELS:
        levels[n].sort(key=lambda k: (k['f'], k['s']))
        missing = [k['c'] for k in levels[n] if not k['ko']]
        if missing:
            print(f'[kanji {n}] missing Korean meaning:', ''.join(missing), file=sys.stderr)
    return levels


# ---------------------------------------------------------------- vocab
def load_freq():
    try:
        from wordfreq import get_frequency_dict
        return get_frequency_dict('ja')
    except Exception:  # wordfreq optional: fall back to list order
        print('wordfreq unavailable: vocab keeps source order', file=sys.stderr)
        return {}


def clean_en(s):
    s = re.sub(r'\s*\([^)]*\)', '', s)
    parts = [p.strip() for p in re.split(r'[,;]', s) if p.strip()]
    return ', '.join(parts[:3])


def load_ko(level):
    """Korean glosses: 'word<TAB>뜻' or, for spellings with several readings,
    'word|reading<TAB>뜻'."""
    path = os.path.join(CONTENT, 'vocab_ko', f'{level}.tsv')
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8') as f:
        for i, line in enumerate(f):
            line = line.rstrip('\n')
            if not line or line.startswith('#'):
                continue
            p = line.split('\t')
            if len(p) != 2 or not p[1].strip():
                raise SystemExit(f'{path}:{i + 1}: expected word<TAB>뜻: {line!r}')
            out[p[0].strip()] = p[1].strip()
    return out


def build_vocab(export_todo=False):
    freq = load_freq()
    seen = set()
    dup_spell = {}
    seen0 = set()
    for n in LEVELS:
        for r in csv.DictReader(open(fetch(f'{n}.csv'), encoding='utf-8')):
            k = (r['expression'].strip(), r['reading'].strip())
            if k not in seen0:
                seen0.add(k)
                dup_spell[k[0]] = dup_spell.get(k[0], 0) + 1
    levels = {}
    for n in LEVELS:
        rows = list(csv.DictReader(open(fetch(f'{n}.csv'), encoding='utf-8')))
        ko = load_ko(n)
        used = set()
        words = []

        for r in rows:
            expr, reading = r['expression'].strip(), r['reading'].strip()
            key = (expr, reading)
            if key in seen:
                continue
            seen.add(key)
            en = clean_en(r['meaning'])
            f = freq.get(expr, 0.0)
            # kana spelling counts too, but short readings collide with particles (歯=は)
            if expr != reading and len(reading) >= 3:
                f = max(f, freq.get(reading, 0.0) * 0.3)
            gloss = ko.get(f'{expr}|{reading}') or ko.get(expr, '')
            used.add(f'{expr}|{reading}')
            used.add(expr)
            words.append({'w': expr, 'r': reading, 'en': en, 'ko': gloss, 'f': f, 'key': f'{expr}|{reading}' if dup_spell.get(expr, 0) > 1 else expr,
                          'v': 1 if r['meaning'].strip().lower().startswith('to ') else 0})
        for k in ko:
            if k not in used:
                print(f'[vocab {n}] unknown gloss key: {k}', file=sys.stderr)
        words.sort(key=lambda w: -w['f'])
        missing = [w for w in words if not w['ko']]
        if missing:
            print(f'[vocab {n}] {len(missing)}/{len(words)} words without Korean gloss', file=sys.stderr)
        if export_todo:
            with open(os.path.join(CACHE, f'todo_{n}.tsv'), 'w', encoding='utf-8') as f:
                for w in missing:
                    f.write(f"{w['key']}\t{w['r']}\t{w['en']}\n")
        levels[n] = words
    return levels


# ---------------------------------------------------------------- hand-written content
def blocks(path):
    """Split a content file into '## title' blocks of (key, value) lines."""
    if not os.path.exists(path):
        return []
    out, cur = [], None
    with open(path, encoding='utf-8') as f:
        for ln, line in enumerate(f, 1):
            line = line.rstrip('\n')
            if not line.strip() or line.startswith('# '):
                continue
            if line.startswith('## '):
                cur = {'title': line[3:].strip(), 'lines': [], 'at': f'{path}:{ln}'}
                out.append(cur)
                continue
            m = re.match(r'^([a-zA-Z가-힣]+):\s?(.*)$', line)
            if not m or cur is None:
                raise SystemExit(f'{path}:{ln}: cannot parse {line!r}')
            cur['lines'].append((m.group(1), m.group(2).strip()))
    return out


FURI = re.compile(r'([^\[\]]+?)\[([^\]]+)\]')


def check_ja(s, where):
    if s.count('[') != s.count(']') or s.count('{') != s.count('}'):
        raise SystemExit(f'{where}: unbalanced brackets in {s!r}')


def split_pair(v, where):
    if ' | ' not in v:
        raise SystemExit(f'{where}: expected "日本語 | 한국어": {v!r}')
    ja, ko = v.split(' | ', 1)
    check_ja(ja, where)
    return [ja.strip(), ko.strip()]


def build_grammar(level):
    out = []
    for b in blocks(os.path.join(CONTENT, 'grammar', f'{level}.txt')):
        g = {'p': b['title'], 'm': '', 'f': '', 'd': '', 'ex': []}
        for k, v in b['lines']:
            if k == 'm':
                g['m'] = v
            elif k == 'f':
                g['f'] = v
            elif k == 'd':
                g['d'] = (g['d'] + ' ' + v).strip()
            elif k == 'e':
                ex = split_pair(v, b['at'])
                if '{' not in ex[0]:
                    raise SystemExit(f"{b['at']}: example needs {{target}}: {ex[0]!r}")
                g['ex'].append(ex)
            else:
                raise SystemExit(f"{b['at']}: unknown key {k}")
        if not g['m'] or not g['ex']:
            raise SystemExit(f"{b['at']}: grammar needs m: and e:")
        out.append(g)
    return out


def parse_questions(lines, at):
    qs, cur = [], None
    for k, v in lines:
        if k == 'q':
            cur = {'q': v, 'o': [], 'a': -1, 'x': ''}
            qs.append(cur)
        elif k == 'o':
            if v.startswith('*'):
                cur['a'] = len(cur['o'])
                v = v[1:].strip()
            cur['o'].append(v)
        elif k == 'x':
            cur['x'] = v
    for q in qs:
        if q['a'] < 0 or len(q['o']) < 2:
            raise SystemExit(f'{at}: question without answer: {q}')
    return qs


def build_reading(level):
    out = []
    for b in blocks(os.path.join(CONTENT, 'reading', f'{level}.txt')):
        body = [v for k, v in b['lines'] if k == 't']
        ko = [v for k, v in b['lines'] if k == 'k']
        for s in body:
            check_ja(s, b['at'])
        qs = parse_questions([(k, v) for k, v in b['lines'] if k in 'qox'], b['at'])
        if not body or not qs:
            raise SystemExit(f"{b['at']}: reading needs t: and q:")
        out.append({'t': b['title'], 'x': body, 'k': ko, 'q': qs})
    return out


def build_listening(level):
    out = []
    for b in blocks(os.path.join(CONTENT, 'listening', f'{level}.txt')):
        item = {'t': b['title'], 's': '', 'lines': [], 'q': None}
        qlines = []
        for k, v in b['lines']:
            if k in ('M', 'F', 'N'):
                item['lines'].append([k] + split_pair(v, b['at']))
            elif k == 's':
                item['s'] = split_pair(v, b['at'])
            elif k == 'q':
                qlines.append(('q', v))
            elif k in ('o', 'x'):
                qlines.append((k, v))
            else:
                raise SystemExit(f"{b['at']}: unknown key {k}")
        qs = parse_questions(qlines, b['at'])
        for q in qs:
            q['q'], q['qk'] = split_pair(q['q'], b['at'])
        item['q'] = qs
        if not item['lines'] or not qs:
            raise SystemExit(f"{b['at']}: listening needs lines and q:")
        out.append(item)
    return out


def build_verbs():
    path = os.path.join(CONTENT, 'verbs.tsv')
    out = []
    if not os.path.exists(path):
        return out
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line or line.startswith('#'):
            continue
        w, r, t, ko, lv = line.split('\t')
        out.append([w, r, t, ko, lv])
    return out


def main():
    export_todo = '--todo' in sys.argv
    kanji = build_kanji()
    vocab = build_vocab(export_todo)
    os.makedirs(OUT, exist_ok=True)
    summary = {}
    for n in LEVELS:
        doc = {
            'level': n.upper(),
            'kanji': [[k['c'], k['ko'], k['en'], '、'.join(k['on']), '、'.join(k['kun']), k['s']] for k in kanji[n]],
            'vocab': [[w['w'], re.sub(r'\s*[(（][^)）]*[)）]\s*', '', w['r']).strip(), w['ko'] or w['en'], w['en'], w['v']] for w in vocab[n]],
            'grammar': build_grammar(n),
            'reading': build_reading(n),
            'listening': build_listening(n),
        }
        with open(os.path.join(OUT, f'{n}.json'), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
        summary[n] = {k: len(v) for k, v in doc.items() if isinstance(v, list)}
    verbs = build_verbs()
    with open(os.path.join(OUT, 'verbs.json'), 'w', encoding='utf-8') as f:
        json.dump(verbs, f, ensure_ascii=False, separators=(',', ':'))
    summary['verbs'] = len(verbs)
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False)
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
