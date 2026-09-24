// Question generators for every item type. A question is always 4-choice so
// it works with a laser pointer / pinch in VR.
import { DB, LEVELS } from './db.js';
import { KANA, CONFUSABLE } from './kana.js';
import { parseRuby, plain, toKata, hasKanji, targetText } from './furigana.js';
import { rec, isKnown } from './srs.js';

export const rand = (n) => Math.floor(Math.random() * n);
export const pick = (a) => a[rand(a.length)];
export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// choose n distinct values (by key) from pool, excluding `exclude` keys
export function distinct(pool, n, keyFn, exclude = []) {
  const seen = new Set(exclude);
  const out = [];
  for (const x of shuffle(pool)) {
    const k = keyFn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

function levelPool(lv, type, span = 1) {
  const i = LEVELS.indexOf(lv);
  const out = [];
  for (let j = Math.max(0, i - span); j <= Math.min(LEVELS.length - 1, i + span); j++) out.push(...DB.levels[LEVELS[j]][type]);
  return out;
}

function make(item, mode, instr, prompt, correct, wrongs, o = {}) {
  const opts = shuffle([{ ...correct, ok: true }, ...wrongs.slice(0, 3)]);
  return { item, id: item?.id, type: item?.type, mode, instr, prompt, options: opts, answer: opts.findIndex((x) => x.ok), ...o };
}

// ---------------------------------------------------------------- kana
function kanaQ(k) {
  // prefer look-alikes and kana the learner has already met
  const all = KANA.all.filter((x) => x.script === k.script && x.id !== k.id && x.k !== 'ー');
  const met = all.filter((x) => x.group === k.group || isKnown(x.id));
  const same = met.length >= 6 ? met : all;
  const conf = [...(CONFUSABLE[k.k] || '')].map((ch) => same.find((x) => x.k === ch)).filter(Boolean);
  const pool = conf.concat(distinct(same, 6, (x) => x.ro, [k.ro]));
  const wrongs = distinct(pool.filter((x) => x.ro !== k.ro), 3, (x) => x.k);
  const modes = k.k === 'ー' ? ['read'] : ['read', 'read', 'listen', 'romaji'];
  const mode = pick(modes);
  if (mode === 'read') {
    const wr = distinct(same.filter((x) => x.ko !== k.ko), 3, (x) => x.ko);
    return make(k, 'kana-read', '이 글자는 어떻게 읽을까요?', { big: k.k, audio: k.k, autoplay: false },
      { label: `${k.ko}  ${k.ro}` }, wr.map((x) => ({ label: `${x.ko}  ${x.ro}` })), { reveal: k.k });
  }
  if (mode === 'listen') {
    return make(k, 'kana-listen', '들리는 소리의 글자를 고르세요', { listen: true, audio: k.k, autoplay: true },
      { label: k.k, big: true }, wrongs.map((x) => ({ label: x.k, big: true })));
  }
  return make(k, 'kana-romaji', `“${k.ko} (${k.ro})” 소리의 글자는?`, { big: k.ro, small: true, audio: k.k },
    { label: k.k, big: true }, wrongs.map((x) => ({ label: x.k, big: true })));
}

// ---------------------------------------------------------------- kanji
function kanjiQ(kj) {
  const pool = levelPool(kj.level, 'kanji', 1).filter((x) => x.c !== kj.c);
  const s = rec(kj.id)?.[0] || 0;
  const modes = ['meaning', 'meaning', 'reverse'];
  if (kj.on || kj.kun) modes.push('reading');
  if (s >= 3) modes.push('reading', 'reverse');
  const mode = pick(modes);
  if (mode === 'meaning') {
    const wr = distinct(pool, 3, (x) => x.ko, [kj.ko]);
    return make(kj, 'kanji-meaning', '이 한자의 뜻(훈음)은?', { big: kj.c }, { label: kj.ko }, wr.map((x) => ({ label: x.ko })));
  }
  if (mode === 'reverse') {
    const wr = distinct(pool, 3, (x) => x.c, [kj.c]);
    return make(kj, 'kanji-reverse', `“${kj.ko}” 에 해당하는 한자는?`, { big: kj.ko, small: true }, { label: kj.c, big: true }, wr.map((x) => ({ label: x.c, big: true })));
  }
  const on = kj.on ? kj.on.split('、')[0] : '';
  const kun = kj.kun ? kj.kun.split('、')[0] : '';
  const useOn = on && (!kun || Math.random() < 0.6);
  const right = useOn ? toKata(on) : kun.replace(/\./g, '').replace(/-/g, '');
  const wr = distinct(pool, 3, (x) => {
    const r = useOn ? x.on?.split('、')[0] : x.kun?.split('、')[0];
    return r ? (useOn ? toKata(r) : r.replace(/\./g, '').replace(/-/g, '')) : null;
  }, [right]).map((x) => ({ label: useOn ? toKata(x.on.split('、')[0]) : x.kun.split('、')[0].replace(/\./g, '').replace(/-/g, '') }));
  return make(kj, 'kanji-reading', `이 한자의 ${useOn ? '음독(音読み)' : '훈독(訓読み)'}은?`, { big: kj.c }, { label: right }, wr);
}

// ---------------------------------------------------------------- vocab
const senses = (ko) => ko.split(/[,，]/).map((x) => x.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
// true when two glosses share a sense (e.g. 보다 / 보다, 구경하다) → ambiguous as options
export function overlaps(a, b) {
  const A = senses(a);
  return senses(b).some((x) => A.includes(x));
}

function vocabQ(v, forceMode) {
  const pool = levelPool(v.level, 'vocab', 1).filter((x) => x.id !== v.id && !overlaps(x.ko, v.ko) && x.w !== v.w);
  const same = pool.filter((x) => x.verb === v.verb);
  const s = rec(v.id)?.[0] || 0;
  const modes = ['meaning', 'meaning', 'reverse', 'listen'];
  if (hasKanji(v.w)) modes.push('reading', 'reading');
  if (s >= 3 && hasKanji(v.w)) modes.push('write');
  const mode = forceMode || pick(modes);
  const src = same.length > 10 ? same : pool;
  if (mode === 'meaning') {
    const wr = distinct(src, 3, (x) => x.ko, [v.ko]);
    return make(v, 'vocab-meaning', '이 단어의 뜻은?', { word: v.w, audio: v.r }, { label: v.ko }, wr.map((x) => ({ label: x.ko })));
  }
  if (mode === 'reverse') {
    const wr = distinct(src, 3, (x) => x.w, [v.w]);
    return make(v, 'vocab-reverse', `“${v.ko}” 는 일본어로?`, { big: v.ko, small: true }, { label: v.ruby, rich: true }, wr.map((x) => ({ label: x.ruby, rich: true })), { reveal: v.r });
  }
  if (mode === 'listen') {
    const wr = distinct(src, 3, (x) => x.ko, [v.ko]);
    return make(v, 'vocab-listen', '들리는 단어의 뜻은?', { listen: true, audio: v.r, autoplay: true }, { label: v.ko }, wr.map((x) => ({ label: x.ko })));
  }
  if (mode === 'reading') {
    // JLPT 漢字読み: similar-looking readings (same length) make it hard
    const wr = readingDistractors(v, pool);
    return make(v, 'vocab-reading', '이 단어의 읽는 법은? (漢字読み)', { word: v.w, noRuby: true }, { label: v.r }, wr.map((r) => ({ label: r })));
  }
  // write: 表記 — choose the kanji spelling for a reading
  const wr = distinct(pool.filter((x) => hasKanji(x.w) && x.w.length === v.w.length), 3, (x) => x.w, [v.w]);
  while (wr.length < 3) {
    const x = pick(pool);
    if (x.w !== v.w && !wr.includes(x)) wr.push(x);
  }
  return make(v, 'vocab-write', `“${v.r}” 를 한자로 쓰면? (表記)`, { big: v.r, small: true, audio: v.r }, { label: v.w, big: true }, wr.map((x) => ({ label: x.w, big: true })));
}

const VOWEL_SWAP = [['う', ''], ['っ', ''], ['ょう', 'よ'], ['ゅう', 'ゆ'], ['ん', ''], ['お', ''], ['い', '']];
const DAKU = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
function readingDistractors(v, pool) {
  const r = v.r;
  const out = new Set();
  // classic traps: long vowel, small っ, voicing
  for (const [a, b] of VOWEL_SWAP) {
    if (r.includes(a) && out.size < 2) out.add(r.replace(a, b));
  }
  for (let i = 0; i < r.length && out.size < 3; i++) {
    const d = DAKU[r[i]];
    if (d) out.add(r.slice(0, i) + d + r.slice(i + 1));
    const inv = Object.keys(DAKU).find((k) => DAKU[k] === r[i]);
    if (inv) out.add(r.slice(0, i) + inv + r.slice(i + 1));
  }
  // words sharing a kanji
  const ch = [...v.w].find((c) => /[一-龯]/.test(c));
  for (const x of shuffle(DB.wordsByKanji.get(ch) || [])) if (x.r !== r && x.r.length >= 2) { out.add(x.r); break; }
  out.delete(r);
  out.delete('');
  const res = shuffle([...out]).slice(0, 3);
  for (const x of shuffle(pool)) {
    if (res.length >= 3) break;
    if (x.r !== r && !res.includes(x.r)) res.push(x.r);
  }
  return res;
}

// ---------------------------------------------------------------- grammar
function grammarQ(g, forceMode) {
  const pool = levelPool(g.level, 'grammar', 1).filter((x) => x.id !== g.id);
  const ex = pick(g.ex);
  const modes = ['blank', 'blank', 'meaning'];
  const chunks = orderChunks(ex);
  if (chunks) modes.push('order');
  const mode = forceMode || pick(modes);
  if (mode === 'meaning' || (mode === 'blank' && !targetText(ex[0]))) {
    const wr = distinct(pool, 3, (x) => x.m, [g.m]);
    return make(g, 'grammar-meaning', '이 문법의 뜻은?', { big: g.p, small: true }, { label: g.m }, wr.map((x) => ({ label: x.m })), { ex });
  }
  if (mode === 'order' && chunks) {
    return make(g, 'grammar-order', '★에 들어갈 것은? (文の組み立て)', { sentence: chunks.shown, ko: ex[1], furigana: true },
      { label: chunks.star, rich: true }, chunks.others.map((c) => ({ label: c, rich: true })), { ex, full: ex[0] });
  }
  const right = blankAnswer(ex[0]);
  const cands = [];
  const multi = right.includes('…');
  for (const x of pool) {
    for (const e of x.ex) {
      const t = blankAnswer(e[0]);
      // distractors should look like grammar (mostly kana) and have the same number of blanks
      if (t.includes('…') === multi && kanaRatio(t) >= 0.5) cands.push(t);
    }
  }
  const wr = distinct(cands, 3, (x) => x, [right]);
  return make(g, 'grammar-blank', '(　)에 들어갈 가장 알맞은 것은?', { sentence: ex[0], blank: true, ko: ex[1] },
    { label: right }, wr.map((x) => ({ label: x })), { ex });
}

// answer text for the blank(s): separate target spans are joined with " … "
export function blankAnswer(src) {
  const parts = [];
  let cur = '';
  let inT = false;
  for (const tk of parseRuby(src)) {
    if (tk.g) {
      cur += tk.t;
      inT = true;
    } else if (inT) {
      parts.push(cur);
      cur = '';
      inT = false;
    }
  }
  if (cur) parts.push(cur);
  return parts.join(' … ');
}
const kanaRatio = (s) => {
  const chars = [...s.replace(/[ …]/g, '')];
  return chars.length ? chars.filter((c) => /[ぁ-んァ-ヶー]/.test(c)).length / chars.length : 0;
};

// JLPT ★ question (文の組み立て): four consecutive phrases around the grammar
// target are blanked; the learner picks the phrase that belongs in ★.
// Phrase boundaries come from the build step (tools/chunk.mjs).
const PUNCT = /^[。、！？!?「」『』（）\s…―－]+$/;
export function orderChunks(ex) {
  const [src, , bounds] = ex;
  if (!bounds || !bounds.length) return null;
  const units = [];
  let off = 0;
  for (const tk of parseRuby(src.replace(/[{}]/g, ''))) {
    if (tk.r) {
      units.push({ s: off, m: `｜${tk.t}[${tk.r}]`, p: tk.t });
      off += tk.t.length;
    } else {
      for (const ch of tk.t) units.push({ s: off++, m: ch, p: ch });
    }
  }
  const cuts = [0, ...bounds, off];
  const chunks = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const us = units.filter((u) => u.s >= cuts[i] && u.s < cuts[i + 1]);
    if (us.length) chunks.push({ m: us.map((u) => u.m).join(''), p: us.map((u) => u.p).join(''), start: cuts[i] });
  }
  const content = chunks.map((c, i) => ({ ...c, i })).filter((c) => !PUNCT.test(c.p));
  if (content.length < 4) return null;
  const brace = src.indexOf('{');
  const tStart = brace >= 0 ? plain(src.slice(0, brace)).length : 0;
  let ti = 0;
  content.forEach((c, k) => {
    if (c.start <= tStart) ti = k;
  });
  const wins = [];
  for (let s = Math.max(0, ti - 3); s <= ti; s++) {
    if (s + 3 >= content.length) break;
    if (content[s + 3].i - content[s].i !== 3) continue;
    wins.push(s);
  }
  if (!wins.length) return null;
  // prefer windows that leave part of the sentence visible
  const visible = wins.filter((s) => content.length > 4 && (s > 0 || s + 4 < content.length));
  const s = pick(visible.length ? visible : wins);
  const four = content.slice(s, s + 4);
  if (new Set(four.map((c) => c.p)).size < 4) return null;
  const starPos = ti - s === 1 || ti - s === 2 ? ti - s : pick([1, 2]);
  const blanks = four.map((_, k) => (k === starPos ? '＿★＿' : '＿＿'));
  const before = chunks.slice(0, four[0].i).map((c) => c.m).join('');
  const after = chunks.slice(four[3].i + 1).map((c) => c.m).join('');
  return {
    shown: `${before} ${blanks.join(' ')} ${after}`.trim(),
    star: four[starPos].m,
    others: four.filter((_, k) => k !== starPos).map((c) => c.m),
    order: four.map((c) => c.m),
  };
}

export function makeQuestion(item, forceMode) {
  switch (item.type) {
    case 'kana': return kanaQ(item);
    case 'kanji': return kanjiQ(item);
    case 'vocab': return vocabQ(item, forceMode);
    case 'grammar': return grammarQ(item, forceMode);
  }
  return null;
}
