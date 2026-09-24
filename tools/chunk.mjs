// Adds bunsetsu (phrase) boundaries to every grammar example so the app can
// build JLPT "文の組み立て (★)" questions. Run after build_data.py:
//   node tools/chunk.mjs
// Each example becomes [ja, ko, [b1, b2, ...]] where b are offsets into the
// plain (ruby-stripped) sentence, snapped to furigana boundaries.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseRuby } from '../src/core/furigana.js';

const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const DIC = path.join(ROOT, 'node_modules', 'kuromoji', 'dict');

const INDEPENDENT = new Set(['名詞', '動詞', '形容詞', '副詞', '連体詞', '接続詞', '感動詞', '接頭詞']);

function isHead(t, prev) {
  if (t.pos === '記号') return true;
  if (!INDEPENDENT.has(t.pos)) return false;
  if (['接尾', '非自立'].includes(t.pos_detail_1) && t.pos !== '名詞') return false;
  if (t.pos === '名詞' && t.pos_detail_1 === '接尾') return false;
  if (!prev) return true;
  if (prev.pos === '接頭詞') return false;
  if (prev.pos === '記号') return true;
  // compound nouns and サ変 nouns + する stay together
  if (t.pos === '名詞' && prev.pos === '名詞' && t.pos_detail_1 !== '非自立') return false;
  if (t.pos === '動詞' && t.basic_form === 'する' && prev.pos === '名詞') return false;
  return true;
}

function bunsetsu(tokenizer, text) {
  const toks = tokenizer.tokenize(text);
  const bounds = [];
  let off = 0;
  let prev = null;
  for (const t of toks) {
    if (off > 0 && isHead(t, prev)) bounds.push(off);
    else if (prev && prev.pos === '記号' && off > 0) bounds.push(off);
    off += t.surface_form.length;
    prev = t;
  }
  return bounds;
}

// snap plain-text offsets so they never split a furigana unit
function snap(markup, bounds) {
  const units = [];
  let off = 0;
  for (const tk of parseRuby(markup)) {
    if (tk.r) {
      units.push([off, off + tk.t.length]);
      off += tk.t.length;
    } else {
      for (const ch of tk.t) {
        units.push([off, off + 1]);
        off += 1;
      }
    }
  }
  const ok = new Set(units.map((u) => u[0]).concat([off]));
  const out = new Set();
  for (const b of bounds) {
    if (ok.has(b)) out.add(b);
    else {
      const u = units.find((x) => x[0] < b && b < x[1]);
      if (u) out.add(u[1]);
    }
  }
  return [...out].filter((b) => b > 0 && b < off).sort((a, b) => a - b);
}

kuromoji.builder({ dicPath: DIC }).build((err, tokenizer) => {
  if (err) throw err;
  let total = 0;
  for (const f of fs.readdirSync(DATA).filter((x) => /^n\d\.json$/.test(x))) {
    const p = path.join(DATA, f);
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const g of d.grammar) {
      g.ex = g.ex.map(([ja, ko]) => {
        const plainText = parseRuby(ja).map((t) => t.t).join('');
        total++;
        return [ja, ko, snap(ja, bunsetsu(tokenizer, plainText))];
      });
    }
    fs.writeFileSync(p, JSON.stringify(d));
  }
  console.log('chunked', total, 'examples');
});
