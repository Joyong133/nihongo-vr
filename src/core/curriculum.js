// The guided path: which new items to teach today, level progress, ETA.
import { DB, LEVELS } from './db.js';
import { KANA } from './kana.js';
import { store, STAGES, PACES, dayStats, today } from './store.js';
import { dueIds, isKnown, rec } from './srs.js';

export const NEXT_STAGE = { kana: 'n5', n5: 'n4', n4: 'n3', n3: 'n2', n2: 'n1', n1: 'done' };

export function pace() {
  return PACES[store.d.settings.pace] || PACES.normal;
}

// Items per day for each type at a level, balanced so every type of the
// level finishes on about the same day.
export function quotas(lv) {
  const P = pace();
  if (lv === 'kana') return { kana: P.kana };
  const L = DB.levels[lv];
  const days = Math.max(1, Math.ceil(L.vocab.length / P.vocab));
  return {
    days,
    vocab: P.vocab,
    kanji: Math.ceil(L.kanji.length / days),
    grammar: Math.ceil(L.grammar.length / days),
  };
}

export function nextKanaGroups(n) {
  const out = [];
  for (const g of KANA.groups) {
    if (g.items.some((it) => !isKnown(it.id))) out.push(g);
    if (out.length >= n) break;
  }
  return out;
}

export function nextNew(lv, type, n) {
  const out = [];
  for (const it of DB.levels[lv][type]) {
    if (!isKnown(it.id)) out.push(it);
    if (out.length >= n) break;
  }
  return out;
}

export function remainingNew(lv, type) {
  return DB.levels[lv][type].reduce((a, it) => a + (isKnown(it.id) ? 0 : 1), 0);
}

// Today's lesson plan for the current stage.
export function planToday() {
  const d = store.d;
  const lv = d.stage;
  const ds = dayStats();
  const nk = ds.nk || (ds.nk = {});
  const plan = { stage: lv, reviews: [], kana: [], kanji: [], vocab: [], grammar: [], extra: null };
  plan.reviews = dueIds().slice(0, d.settings.reviewCap);
  if (lv === 'done') return plan;
  const q = quotas(lv);
  if (lv === 'kana') {
    const left = Math.max(0, q.kana - (nk.kana || 0));
    plan.kana = nextKanaGroups(left);
    return plan;
  }
  for (const type of ['kanji', 'vocab', 'grammar']) {
    const left = Math.max(0, q[type] - (nk[type] || 0));
    plan[type] = nextNew(lv, type, left);
  }
  plan.extra = nextExtra(lv);
  return plan;
}

// Reading / listening tasks unlock as vocabulary progress grows.
export function unlockedExtras(lv, kind) {
  const L = DB.levels[lv];
  const list = L[kind];
  if (!list.length) return [];
  const p = 1 - remainingNew(lv, 'vocab') / Math.max(1, L.vocab.length);
  const n = p >= 0.98 ? list.length : Math.min(list.length, Math.floor(p * list.length + 0.35));
  return list.slice(0, n);
}

export function nextExtra(lv) {
  const ds = dayStats();
  if (ds.extraDone) return null;
  const pending = (kind) => unlockedExtras(lv, kind).filter((x) => store.d.done[kind][x.id] === undefined);
  const r = pending('reading');
  const l = pending('listening');
  if (!r.length && !l.length) return null;
  const doneR = Object.keys(store.d.done.reading).length;
  const doneL = Object.keys(store.d.done.listening).length;
  if (r.length && (!l.length || doneR <= doneL)) return r[0];
  return l[0];
}

export function planSize(p) {
  return p.reviews.length + p.kana.reduce((a, g) => a + g.items.length, 0) + p.kanji.length + p.vocab.length + p.grammar.length;
}

// ---------------------------------------------------------------- progress
export function levelProgress(lv) {
  const out = {};
  if (lv === 'kana') {
    const all = KANA.all;
    const known = all.filter((k) => isKnown(k.id));
    out.kana = { total: all.length, seen: known.length, strong: known.filter((k) => rec(k.id)[0] >= 5).length };
    out.frac = known.length / all.length;
    out.mastery = out.kana.strong / all.length;
    return out;
  }
  const L = DB.levels[lv];
  let tot = 0;
  let seen = 0;
  let strong = 0;
  for (const type of ['kanji', 'vocab', 'grammar']) {
    const list = L[type];
    const s = list.filter((it) => isKnown(it.id));
    const st = s.filter((it) => rec(it.id)[0] >= 5).length;
    out[type] = { total: list.length, seen: s.length, strong: st };
    tot += list.length;
    seen += s.length;
    strong += st;
  }
  for (const kind of ['reading', 'listening']) {
    const list = L[kind];
    out[kind] = { total: list.length, seen: list.filter((x) => store.d.done[kind][x.id] !== undefined).length };
  }
  out.frac = tot ? seen / tot : 1;
  out.mastery = tot ? strong / tot : 1;
  return out;
}

export function allIntroduced(lv) {
  if (lv === 'kana') return KANA.all.every((k) => isKnown(k.id));
  const L = DB.levels[lv];
  return ['kanji', 'vocab', 'grammar'].every((t) => L[t].every((it) => isKnown(it.id)));
}

// Estimated remaining study days to finish N1 at the current pace.
export function etaDays() {
  const d = store.d;
  const P = pace();
  let days = 0;
  const idx = STAGES.indexOf(d.stage);
  if (idx < 0) return 0;
  for (let i = idx; i < STAGES.length; i++) {
    const lv = STAGES[i];
    if (lv === 'kana') {
      const left = nextKanaGroups(99).length;
      days += Math.ceil(left / P.kana);
    } else {
      const left = remainingNew(lv, 'vocab');
      const leftK = remainingNew(lv, 'kanji');
      const leftG = remainingNew(lv, 'grammar');
      const q = quotas(lv);
      days += Math.max(Math.ceil(left / q.vocab), Math.ceil(leftK / q.kanji || 0), Math.ceil(leftG / Math.max(1, q.grammar)));
      days += 3; // exam prep + mock exam
    }
  }
  return days;
}

export function totalDaysAtPace(paceKey) {
  const P = PACES[paceKey];
  let days = Math.ceil(KANA.groups.length / P.kana);
  for (const lv of LEVELS) days += Math.ceil(DB.levels[lv].vocab.length / P.vocab) + 3;
  return days;
}

export function advanceStage() {
  const d = store.d;
  d.stage = NEXT_STAGE[d.stage] || 'done';
  store.save();
  return d.stage;
}

export { STAGES, today };
