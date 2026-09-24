// Spaced repetition: 10 stages with growing intervals (hours).
import { store } from './store.js';

export const INTERVAL_H = [0, 4, 8, 24, 48, 96, 168, 336, 720, 1440, 4320];
export const MAX_STAGE = 10;
export const nowMin = () => Math.floor(Date.now() / 60000);

export function rec(id) {
  return store.d.items[id];
}

export function isKnown(id) {
  return !!store.d.items[id];
}

export function learn(id) {
  store.d.items[id] = [1, nowMin() + INTERVAL_H[1] * 60, 0, 1];
}

// first answer of the session for this item
export function grade(id, correct) {
  const r = store.d.items[id];
  if (!r) {
    learn(id);
    return;
  }
  let [stage, , lapses, reps] = r;
  if (correct) stage = Math.min(MAX_STAGE, stage + 1);
  else {
    lapses++;
    stage = stage >= 6 ? stage - 2 : Math.max(1, stage - 1);
  }
  store.d.items[id] = [stage, nowMin() + INTERVAL_H[stage] * 60, lapses, reps + 1];
}

// mark as already known (placement / "이미 알아요")
export function markKnown(id) {
  store.d.items[id] = [6, nowMin() + INTERVAL_H[6] * 60, 0, 0];
}

export function dueIds() {
  const t = nowMin();
  const out = [];
  for (const [id, r] of Object.entries(store.d.items)) if (r[1] <= t) out.push([id, r[1]]);
  out.sort((a, b) => a[1] - b[1]);
  return out.map((x) => x[0]);
}

export function stageName(stage) {
  if (!stage) return '미학습';
  if (stage <= 2) return '새싹';
  if (stage <= 4) return '익숙';
  if (stage <= 6) return '숙련';
  if (stage <= 8) return '마스터';
  return '완전정복';
}

export function nextDueText(id) {
  const r = store.d.items[id];
  if (!r) return '';
  const m = r[1] - nowMin();
  if (m <= 0) return '지금 복습';
  if (m < 60) return `${m}분 후`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 후`;
  return `${Math.round(m / 1440)}일 후`;
}
