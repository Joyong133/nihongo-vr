// Drills: verb/adjective conjugation, numbers, counters, dates & times.
import { C } from '../ui/theme.js';
import { DB } from '../core/db.js';
import { store } from '../core/store.js';
import { wordRuby, isKanji } from '../core/furigana.js';
import { VERB_FORMS, ADJ_FORMS, conjugate, wrongForms, formOK } from '../core/conj.js';
import { pick, shuffle, distinct } from '../core/quiz.js';
import { QuizRun } from './browse.js';

const LV_ORDER = ['n5', 'n4', 'n3', 'n2', 'n1'];

// reading of a conjugated/wrong form, reusing the kanji stem of the base word
function formRuby(v, written) {
  const [w, r] = v;
  let last = -1;
  for (let i = 0; i < w.length; i++) if (isKanji(w[i])) last = i;
  if (last < 0 || v[2] === 'k') return written;
  const pre = w.slice(0, last + 1);
  if (!written.startsWith(pre)) return written;
  const tailBase = w.length - (last + 1);
  const rPre = r.slice(0, r.length - tailBase);
  return wordRuby(written, rPre + written.slice(pre.length));
}

function conjQuestion(pool, forms) {
  let v;
  let f;
  for (let tries = 0; tries < 50; tries++) {
    v = pick(pool);
    f = pick(forms);
    if (formOK(v, f[0])) break;
  }
  const [fkey, fname, fdesc] = f;
  const right = conjugate(v, fkey);
  const wrong = distinct(wrongForms(v, fkey), 3, (x) => x, [right.w]);
  const opts = shuffle([{ label: formRuby(v, right.w), rich: true, ok: true }, ...wrong.map((w) => ({ label: formRuby(v, w), rich: true }))]);
  return {
    item: null,
    mode: 'conj',
    instr: `${fname}으로 바꾸면? — ${fdesc}`,
    prompt: { word: wordRuby(v[0], v[1]), audio: v[1] },
    options: opts,
    answer: opts.findIndex((o) => o.ok),
    explain: `${v[0]} (${v[3]}) → ${right.w}`,
  };
}

// ---------------------------------------------------------------- numbers
const DIG = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
function under10000(n) {
  let s = '';
  const sen = Math.floor(n / 1000);
  const hyaku = Math.floor((n % 1000) / 100);
  const juu = Math.floor((n % 100) / 10);
  const one = n % 10;
  if (sen) s += sen === 1 ? 'せん' : sen === 3 ? 'さんぜん' : sen === 8 ? 'はっせん' : `${DIG[sen]}せん`;
  if (hyaku) s += hyaku === 1 ? 'ひゃく' : hyaku === 3 ? 'さんびゃく' : hyaku === 6 ? 'ろっぴゃく' : hyaku === 8 ? 'はっぴゃく' : `${DIG[hyaku]}ひゃく`;
  if (juu) s += juu === 1 ? 'じゅう' : `${DIG[juu]}じゅう`;
  if (one) s += DIG[one];
  return s;
}
export function numReading(n) {
  if (n === 0) return 'ゼロ';
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  return (man ? `${under10000(man)}まん` : '') + under10000(rest);
}
function numVariants(r) {
  const swaps = [['びゃく', 'ひゃく'], ['ぴゃく', 'ひゃく'], ['ひゃく', 'びゃく'], ['ぜん', 'せん'], ['っせん', 'ちせん'], ['っぴゃく', 'くひゃく'], ['よん', 'し'], ['なな', 'しち'], ['きゅう', 'く']];
  const out = new Set();
  for (const [a, b] of swaps) if (r.includes(a)) out.add(r.replace(a, b));
  return [...out];
}
function numberQuestion() {
  const mags = [[10, 99], [100, 999], [1000, 9999], [10000, 99999]];
  const [lo, hi] = pick(mags);
  let n = lo + Math.floor(Math.random() * (hi - lo));
  if (Math.random() < 0.5) n = Math.round(n / 100) * 100 || n; // favour tricky hundreds
  const right = numReading(n);
  const wr = numVariants(right);
  while (wr.length < 3) {
    const m = n + (Math.random() < 0.5 ? -1 : 1) * pick([1, 10, 100, 1000].filter((d) => d < n));
    const x = numReading(Math.max(1, m));
    if (x !== right && !wr.includes(x)) wr.push(x);
  }
  const opts = shuffle([{ label: right, ok: true }, ...shuffle(wr).slice(0, 3).map((l) => ({ label: l }))]);
  return { item: null, mode: 'num', instr: '이 숫자는 어떻게 읽을까요?', prompt: { big: n.toLocaleString('ja-JP'), audio: right }, options: opts, answer: opts.findIndex((o) => o.ok) };
}

// ---------------------------------------------------------------- counters
const NUMK = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export const COUNTERS = {
  '人': ['사람 수', 'ひとり ふたり さんにん よにん ごにん ろくにん ななにん はちにん きゅうにん じゅうにん'],
  '本': ['가늘고 긴 것 (병·연필)', 'いっぽん にほん さんぼん よんほん ごほん ろっぽん ななほん はっぽん きゅうほん じゅっぽん'],
  '枚': ['얇은 것 (종이·셔츠)', 'いちまい にまい さんまい よんまい ごまい ろくまい ななまい はちまい きゅうまい じゅうまい'],
  '匹': ['작은 동물', 'いっぴき にひき さんびき よんひき ごひき ろっぴき ななひき はっぴき きゅうひき じゅっぴき'],
  '個': ['작은 물건', 'いっこ にこ さんこ よんこ ごこ ろっこ ななこ はっこ きゅうこ じゅっこ'],
  '回': ['횟수', 'いっかい にかい さんかい よんかい ごかい ろっかい ななかい はっかい きゅうかい じゅっかい'],
  '階': ['층', 'いっかい にかい さんがい よんかい ごかい ろっかい ななかい はっかい きゅうかい じゅっかい'],
  '杯': ['잔·그릇', 'いっぱい にはい さんばい よんはい ごはい ろっぱい ななはい はっぱい きゅうはい じゅっぱい'],
  '冊': ['책', 'いっさつ にさつ さんさつ よんさつ ごさつ ろくさつ ななさつ はっさつ きゅうさつ じゅっさつ'],
  '台': ['기계·차', 'いちだい にだい さんだい よんだい ごだい ろくだい ななだい はちだい きゅうだい じゅうだい'],
  '歳': ['나이', 'いっさい にさい さんさい よんさい ごさい ろくさい ななさい はっさい きゅうさい じゅっさい'],
  'つ': ['물건 (고유어 수사)', 'ひとつ ふたつ みっつ よっつ いつつ むっつ ななつ やっつ ここのつ とお'],
  '分': ['~분 (시간)', 'いっぷん にふん さんぷん よんぷん ごふん ろっぷん ななふん はっぷん きゅうふん じゅっぷん'],
  '時': ['~시', 'いちじ にじ さんじ よじ ごじ ろくじ しちじ はちじ くじ じゅうじ'],
  '日': ['날짜 (~일)', 'ついたち ふつか みっか よっか いつか むいか なのか ようか ここのか とおか'],
  '月': ['~월', 'いちがつ にがつ さんがつ しがつ ごがつ ろくがつ しちがつ はちがつ くがつ じゅうがつ'],
  '円': ['엔 (돈)', 'いちえん にえん さんえん よえん ごえん ろくえん ななえん はちえん きゅうえん じゅうえん'],
  '週間': ['~주간', 'いっしゅうかん にしゅうかん さんしゅうかん よんしゅうかん ごしゅうかん ろくしゅうかん ななしゅうかん はっしゅうかん きゅうしゅうかん じゅっしゅうかん'],
};
const SPECIAL = [
  ['二十日', 'はつか', '날짜 20일'], ['十四日', 'じゅうよっか', '날짜 14일'], ['二十四日', 'にじゅうよっか', '날짜 24일'],
  ['十一月', 'じゅういちがつ', '11월'], ['十二月', 'じゅうにがつ', '12월'], ['何人', 'なんにん', '몇 명'], ['何本', 'なんぼん', '몇 자루/병'],
  ['何匹', 'なんびき', '몇 마리'], ['何杯', 'なんばい', '몇 잔'], ['何階', 'なんがい', '몇 층'], ['何日', 'なんにち', '며칠'], ['何時', 'なんじ', '몇 시'],
  ['何分', 'なんぷん', '몇 분'], ['何歳', 'なんさい', '몇 살'], ['半', 'はん', '반 (~시 반)'], ['午前', 'ごぜん', '오전'], ['午後', 'ごご', '오후'],
];
const VOICE_SWAP = { ほ: 'ぼぽ', ぼ: 'ほぽ', ぽ: 'ほぼ', ひ: 'びぴ', び: 'ひぴ', ぴ: 'ひび', は: 'ばぱ', ば: 'はぱ', ぱ: 'はば', ふ: 'ぶぷ', ぷ: 'ふぶ', か: 'が', が: 'か', こ: 'ご', さ: 'ざ', し: 'じ' };
// tricky wrong readings: wrong voicing (さんほん), missing sound change (いちほん)
function counterVariants(r, base) {
  const out = new Set();
  const m = /^(いっ|ろっ|はっ|じゅっ|いち|に|さん|よん|よ|ご|ろく|なな|はち|きゅう|じゅう|しち|く|し)(.)(.*)$/.exec(r);
  if (m) {
    const [, num, first, rest] = m;
    for (const alt of VOICE_SWAP[first] || '') out.add(num + alt + rest);
    const full = { いっ: 'いち', ろっ: 'ろく', はっ: 'はち', じゅっ: 'じゅう' }[num];
    if (base) out.add((full || num) + base);
  }
  out.delete(r);
  return [...out];
}
function counterQuestion() {
  if (Math.random() < 0.18) {
    const [w, r, ko] = pick(SPECIAL);
    const wr = distinct(SPECIAL, 3, (x) => x[1], [r]).map((x) => x[1]);
    const opts = shuffle([{ label: r, ok: true }, ...wr.map((l) => ({ label: l }))]);
    return { item: null, mode: 'counter', instr: `읽는 법은? (${ko})`, prompt: { big: w, audio: r }, options: opts, answer: opts.findIndex((o) => o.ok) };
  }
  const key = pick(Object.keys(COUNTERS));
  const [ko, list] = COUNTERS[key];
  const rs = list.split(' ');
  const n = Math.floor(Math.random() * 10);
  const right = rs[n];
  const base = rs[1].startsWith('に') ? rs[1].slice(1) : null;
  const tricky = counterVariants(right, base);
  const others = rs.filter((x, i) => i !== n && x !== right);
  const wr = [...shuffle(tricky).slice(0, 2), ...shuffle(others)].filter((x, i, a) => x !== right && a.indexOf(x) === i).slice(0, 3);
  const opts = shuffle([{ label: right, ok: true }, ...wr.map((l) => ({ label: l }))]);
  const shown = key === 'つ' ? `${NUMK[n]}つ` : `${n + 1}${key}`;
  return { item: null, mode: 'counter', instr: `읽는 법은? — ${key} : ${ko}`, prompt: { big: shown, audio: right }, options: opts, answer: opts.findIndex((o) => o.ok) };
}

// ---------------------------------------------------------------- menu
export class PracticeMenu {
  constructor(app) {
    this.app = app;
  }

  verbs(types, maxLv) {
    const li = LV_ORDER.indexOf(maxLv);
    return DB.verbs.filter((v) => types.includes(v[2]) && LV_ORDER.indexOf(v[4]) <= Math.max(1, li));
  }

  runConj(title, types, forms) {
    const cur = store.d.stage === 'kana' ? 'n5' : store.d.stage === 'done' ? 'n1' : store.d.stage;
    const pool = this.verbs(types, cur);
    if (!pool.length) {
      this.app.toast('활용 연습용 단어 데이터가 없습니다');
      return;
    }
    const regen = () => Array.from({ length: 10 }, () => conjQuestion(pool, forms));
    this.app.go(new QuizRun(this.app, [], { title, questions: regen(), regen }));
  }

  draw(ui) {
    ui.header('활용 · 숫자 연습', { back: () => this.app.back() });
    const vf = (keys) => VERB_FORMS.filter((f) => keys.includes(f[0]));
    const tiles = [
      ['て', '동사 기본 활용', 'ます · ない · て · た (N5)', C.kana, () => this.runConj('동사 기본 활용', ['5', '5r', '1', 'k', 's'], vf(['masu', 'nai', 'te', 'ta', 'nakatta']))],
      ['れ', '동사 중급 활용', '가능 · 의지 · 명령 · 가정 (N4)', C.vocab, () => this.runConj('동사 중급 활용', ['5', '5r', '1', 'k', 's'], vf(['pot', 'vol', 'imp', 'proh', 'ba', 'tara']))],
      ['せ', '수동 · 사역', '수동 · 사역 · 사역수동 (N4~N3)', C.grammar, () => this.runConj('수동 · 사역', ['5', '1', 'k', 's'], vf(['pass', 'caus', 'causpass']))],
      ['い', '형용사 활용', 'い형용사 · な형용사', C.kanji, () => this.runConj('형용사 활용', ['i', 'na'], ADJ_FORMS)],
      ['百', '숫자 읽기', '300 · 600 · 8000 같은 소리 변화', C.reading, () => {
        const regen = () => Array.from({ length: 10 }, numberQuestion);
        this.app.go(new QuizRun(this.app, [], { title: '숫자 읽기', questions: regen(), regen }));
      }],
      ['本', '조수사 · 날짜 · 시간', '本 · 匹 · 杯 · 日 · 時 · 分 …', C.listening, () => {
        const regen = () => Array.from({ length: 10 }, counterQuestion);
        this.app.go(new QuizRun(this.app, [], { title: '조수사 · 날짜 · 시간', questions: regen(), regen }));
      }],
    ];
    tiles.forEach(([icon, title, sub, color, fn], i) => {
      const x = 60 + (i % 2) * 974;
      const y = 170 + Math.floor(i / 2) * 250;
      ui.tile(x, y, 954, 220, { icon, title, sub, color }, fn);
    });
    ui.para('활용은 한국어의 “먹다 → 먹고/먹어서/먹었다”처럼 일본어 문법의 뼈대입니다. 틀린 선택지는 실제로 자주 하는 실수(예: 行く→行いて)로 만들어져 있어요.', 60, 950, ui.w - 120, { size: 30, color: C.dim });
  }
}
