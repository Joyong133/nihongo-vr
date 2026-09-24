// In-memory content database: loads the level JSON files and indexes items.
import { KANA } from './kana.js';
import { isKanji, wordRuby } from './furigana.js';

export const LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];

export const DB = {
  levels: {},
  verbs: [],
  byId: new Map(),
  kanjiByChar: new Map(),
  wordsByKanji: new Map(),
};

function add(item) {
  DB.byId.set(item.id, item);
  return item;
}

export async function loadDB(base, onProgress) {
  for (const k of KANA.all) add(k);
  let done = 0;
  const files = await Promise.all(
    LEVELS.map(async (lv) => {
      const r = await fetch(`${base}data/${lv}.json`);
      if (!r.ok) throw new Error(`${lv}.json 로드 실패 (${r.status})`);
      const j = await r.json();
      onProgress?.(++done / (LEVELS.length + 1));
      return [lv, j];
    })
  );
  for (const [lv, j] of files) {
    const L = { kanji: [], vocab: [], grammar: [], reading: [], listening: [] };
    j.kanji.forEach(([c, ko, en, on, kun, strokes], i) => {
      const it = add({ id: `j:${c}`, type: 'kanji', level: lv, idx: i, c, ko, en, on, kun, strokes });
      L.kanji.push(it);
      DB.kanjiByChar.set(c, it);
    });
    j.vocab.forEach(([w, r, ko, en, verb], i) => {
      const id = `v:${w}|${r}`;
      if (DB.byId.has(id)) return;
      const it = add({ id, type: 'vocab', level: lv, idx: i, w, r: r.split(/[;；]/)[0].trim(), rAll: r, ko, en, verb: !!verb, ruby: wordRuby(w, r) });
      L.vocab.push(it);
    });
    j.grammar.forEach((g, i) => {
      L.grammar.push(add({ id: `g:${lv}:${g.p}`, type: 'grammar', level: lv, idx: i, ...g }));
    });
    j.reading.forEach((r, i) => L.reading.push({ id: `r:${lv}:${i}`, type: 'reading', level: lv, idx: i, ...r }));
    j.listening.forEach((r, i) => L.listening.push({ id: `l:${lv}:${i}`, type: 'listening', level: lv, idx: i, ...r }));
    DB.levels[lv] = L;
  }
  // kanji → words that contain it (easiest level first)
  for (const lv of LEVELS) {
    for (const v of DB.levels[lv].vocab) {
      for (const ch of new Set(v.w)) {
        if (!isKanji(ch)) continue;
        if (!DB.wordsByKanji.has(ch)) DB.wordsByKanji.set(ch, []);
        DB.wordsByKanji.get(ch).push(v);
      }
    }
  }
  try {
    const r = await fetch(`${base}data/verbs.json`);
    if (r.ok) DB.verbs = await r.json();
  } catch (e) {
    DB.verbs = [];
  }
  onProgress?.(1);
}

export function levelCounts(lv) {
  const L = DB.levels[lv];
  return { kanji: L.kanji.length, vocab: L.vocab.length, grammar: L.grammar.length, reading: L.reading.length, listening: L.listening.length };
}
