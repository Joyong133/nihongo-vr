// Progress persistence (localStorage, debounced). Items are stored compactly:
//   items[id] = [srsStage, dueMinute, lapses, reps]
const KEY = 'nihongo-vr-save-v1';

export const STAGES = ['kana', 'n5', 'n4', 'n3', 'n2', 'n1'];
export const STAGE_NAME = { kana: '문자', n5: 'N5', n4: 'N4', n3: 'N3', n2: 'N2', n1: 'N1', done: 'N1 합격' };

export const PACES = {
  light: { name: '가볍게', desc: '하루 15분', vocab: 8, kana: 1 },
  normal: { name: '보통', desc: '하루 30분', vocab: 15, kana: 2 },
  hard: { name: '집중', desc: '하루 60분', vocab: 25, kana: 3 },
};

function defaults() {
  return {
    v: 1,
    created: Date.now(),
    onboarded: false,
    stage: 'kana',
    settings: {
      pace: 'normal',
      furigana: 'on', // on | off
      romaji: true,
      voice: 'auto', // auto (built-in files, then device TTS) | files | tts
      rate: 1.0,
      sfx: 0.6,
      music: 0.3,
      autoplay: true,
      season: 'auto',
      panelDist: 1.55,
      panelSize: 2.0,
      reviewCap: 150,
    },
    items: {},
    done: { reading: {}, listening: {} },
    exams: {},
    stats: { days: {}, streak: 0, best: 0, lastDay: '', xp: 0 },
  };
}

function merge(base, over) {
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') merge(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}

export const store = {
  d: defaults(),
  _t: null,
  ok: true,
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.d = merge(defaults(), JSON.parse(raw));
    } catch (e) {
      this.ok = false;
    }
    return this.d;
  },
  save(now = false) {
    clearTimeout(this._t);
    const write = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.d));
      } catch (e) {
        this.ok = false;
      }
    };
    if (now) write();
    else this._t = setTimeout(write, 400);
  },
  reset() {
    this.d = defaults();
    this.save(true);
  },
  exportJSON() {
    return JSON.stringify(this.d);
  },
  importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || obj.v !== 1 || !obj.items) throw new Error('올바른 백업 파일이 아닙니다');
    this.d = merge(defaults(), obj);
    this.save(true);
  },
};

export function today(ts = Date.now()) {
  // study day rolls over at 4am local time
  const d = new Date(ts - 4 * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayStats(date = today()) {
  const days = store.d.stats.days;
  if (!days[date]) days[date] = { n: 0, r: 0, ok: 0, ng: 0, sec: 0, nk: {} };
  return days[date];
}

// Mark activity for streak tracking
export function touchStreak() {
  const s = store.d.stats;
  const t = today();
  if (s.lastDay === t) return;
  const y = today(Date.now() - 24 * 3600 * 1000);
  s.streak = s.lastDay === y ? s.streak + 1 : 1;
  s.best = Math.max(s.best, s.streak);
  s.lastDay = t;
}
