#!/usr/bin/env python3
"""Subset Noto Sans JP / KR (OFL) to the characters the app actually uses.

Japanese glyph shapes matter for learners (直, 骨, 角 … differ between CJK
locales), so the app ships its own Japanese font instead of relying on the
headset's system font. Output: public/fonts/{njp,nkr}.woff2
"""
import glob
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CACHE = os.path.join(os.path.dirname(__file__), '.cache')
OUT = os.path.join(ROOT, 'public', 'fonts')
FONTS = {
    'NotoSansJP.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf',
    'NotoSansKR.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf',
}


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('download', FONTS[name], file=sys.stderr)
        urllib.request.urlretrieve(FONTS[name], path)
    return path


def used_chars():
    chars = set()
    files = glob.glob(os.path.join(ROOT, 'public', 'data', '*.json'))
    files += glob.glob(os.path.join(ROOT, 'src', '**', '*.js'), recursive=True)
    files += [os.path.join(ROOT, 'index.html')]
    for f in files:
        with open(f, encoding='utf-8') as fh:
            chars |= set(fh.read())
    return chars


def is_hangul(c):
    o = ord(c)
    return 0xAC00 <= o <= 0xD7A3 or 0x1100 <= o <= 0x11FF or 0x3130 <= o <= 0x318F


def main():
    chars = used_chars()
    base = set(chr(c) for c in range(0x20, 0x7F))
    base |= set(chr(c) for c in range(0x3000, 0x3100))  # CJK punctuation + kana
    base |= set(chr(c) for c in range(0xFF01, 0xFF5F))  # full-width forms
    base |= set('・…‥「」『』（）〔〕［］｛｝〈〉《》【】〜～ー―※★☆○●◎△▲×→←↑↓‹›«»◀▶♪·°%々〆ヶ')
    jp = sorted(c for c in (chars | base) if not is_hangul(c) and ord(c) >= 0x20)
    # common Hangul (KS X 1001) so future text renders, plus everything used
    ko = set(c for c in chars if is_hangul(c))
    for o in range(0xAC00, 0xD7A4):
        c = chr(o)
        try:
            if len(c.encode('euc-kr')) == 2:  # the 2,350 precomposed KS X 1001 syllables
                ko.add(c)
        except UnicodeEncodeError:
            pass
    ko |= set(chr(c) for c in range(0x3131, 0x318F))
    ko = sorted(ko)
    os.makedirs(OUT, exist_ok=True)
    for name, out, cs in (('NotoSansJP.ttf', 'njp.woff2', jp), ('NotoSansKR.ttf', 'nkr.woff2', ko)):
        uni = os.path.join(CACHE, out + '.txt')
        with open(uni, 'w') as f:
            f.write('\n'.join(f'U+{ord(c):04X}' for c in cs))
        subprocess.run([
            sys.executable, '-m', 'fontTools.subset', fetch(name),
            f'--unicodes-file={uni}', '--flavor=woff2', f'--output-file={os.path.join(OUT, out)}',
            '--layout-features=kern,liga,palt,locl,ccmp', '--no-hinting', '--desubroutinize',
        ], check=True)
        print(out, len(cs), 'glyphs', os.path.getsize(os.path.join(OUT, out)) // 1024, 'KB')


if __name__ == '__main__':
    main()
