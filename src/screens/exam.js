// JLPT-style mock exams with sectional scoring and pass/fail, which also
// act as the gate to the next stage of the curriculum.
import { C } from '../ui/theme.js';
import { DB, LEVELS } from '../core/db.js';
import { KANA } from '../core/kana.js';
import { store, STAGE_NAME, touchStreak } from '../core/store.js';
import { advanceStage } from '../core/curriculum.js';
import { makeQuestion, shuffle } from '../core/quiz.js';
import { hasKanji } from '../core/furigana.js';
import { QuizCard } from './common.js';

// JLPT pass marks (total / per-section minimum)
export const PASS = {
  n1: { total: 100, secs: ['lang', 'read', 'listen'] },
  n2: { total: 90, secs: ['lang', 'read', 'listen'] },
  n3: { total: 95, secs: ['lang', 'read', 'listen'] },
  n4: { total: 90, secs: ['langread', 'listen'] },
  n5: { total: 80, secs: ['langread', 'listen'] },
};
const SEC_NAME = { lang: '언어지식 (문자·어휘·문법)', read: '독해', listen: '청해', langread: '언어지식·독해', kana: '문자' };

function sample(list, n) {
  return shuffle(list).slice(0, n);
}

function buildExam(lv) {
  const steps = [];
  if (lv === 'kana') {
    const items = sample(KANA.all.filter((k) => k.k !== 'ー'), 20);
    steps.push({ kind: 'banner', title: '문자 (히라가나·가타카나)', sub: '20문제 · 80점 이상이면 N5로 올라갑니다' });
    for (const it of items) steps.push({ kind: 'q', sec: 'kana', q: makeQuestion(it) });
    return steps;
  }
  const L = DB.levels[lv];
  const kanjiWords = L.vocab.filter((v) => hasKanji(v.w) && v.w !== v.r);
  steps.push({ kind: 'banner', title: '언어지식 — 문자·어휘', sub: '한자 읽기 · 표기 · 의미' });
  for (const v of sample(kanjiWords, 5)) steps.push({ kind: 'q', sec: 'vocab', q: makeQuestion(v, 'reading') });
  for (const v of sample(kanjiWords, 4)) steps.push({ kind: 'q', sec: 'vocab', q: makeQuestion(v, 'write') });
  for (const v of sample(L.vocab, 4)) steps.push({ kind: 'q', sec: 'vocab', q: makeQuestion(v, 'meaning') });
  if (L.grammar.length) {
    steps.push({ kind: 'banner', title: '언어지식 — 문법', sub: '문법 형식 판단 · 문장 만들기(★)' });
    for (const g of sample(L.grammar, 8)) steps.push({ kind: 'q', sec: 'grammar', q: makeQuestion(g, 'blank') });
    let n = 0;
    for (const g of shuffle(L.grammar)) {
      if (n >= 4) break;
      const q = makeQuestion(g, 'order');
      if (q.mode === 'grammar-order') {
        steps.push({ kind: 'q', sec: 'grammar', q });
        n++;
      }
    }
  }
  if (L.reading.length) {
    steps.push({ kind: 'banner', title: '독해', sub: '지문을 읽고 질문에 답하세요' });
    let qn = 0;
    for (const t of shuffle(L.reading)) {
      if (qn >= 4) break;
      steps.push({ kind: 'passage', task: t });
      for (const q of t.q) {
        steps.push({
          kind: 'q', sec: 'read', task: t,
          q: { mode: 'reading', instr: '질문에 알맞은 답을 고르세요', prompt: { sentence: q.q }, options: q.o.map((o) => ({ label: o, rich: true })), answer: q.a, x: q.x },
        });
        qn++;
      }
    }
  }
  if (L.listening.length) {
    steps.push({ kind: 'banner', title: '청해', sub: '스피커를 눌러 듣고 답하세요 (여러 번 들어도 됩니다)' });
    for (const t of sample(L.listening, 4)) {
      const q = t.q[0];
      const seq = [];
      if (t.s) seq.push(['F', t.s[0]]);
      seq.push(['F', q.q]);
      for (const [spk, ja] of t.lines) seq.push([spk === 'M' ? 'M' : 'F', ja]);
      seq.push(['F', q.q]);
      steps.push({
        kind: 'q', sec: 'listen', task: t,
        q: { mode: 'listening', instr: '대화를 듣고 알맞은 답을 고르세요', prompt: { listen: true, seq, sentence: q.q, autoplay: true }, options: q.o.map((o) => ({ label: o, rich: true })), answer: q.a, x: q.x },
      });
    }
  }
  return steps;
}

export class ExamMenu {
  constructor(app) {
    this.app = app;
  }

  draw(ui) {
    ui.header('모의고사', { back: () => this.app.back() });
    const list = ['kana', ...LEVELS];
    list.forEach((lv, i) => {
      const x = 60 + (i % 2) * 974;
      const y = 160 + Math.floor(i / 2) * 250;
      const r = store.d.exams[lv];
      const cur = store.d.stage === lv;
      const sub = r ? `최고 ${r.best}점 ${r.passed ? '· 합격' : ''}` : lv === 'kana' ? '가나 20문제' : `합격선 ${PASS[lv].total}/180`;
      ui.tile(x, y, 954, 220, { icon: lv === 'kana' ? 'あ' : lv.toUpperCase().replace('N', ''), title: `${STAGE_NAME[lv]} 모의고사${cur ? ' (현재 단계)' : ''}`, sub, color: r?.passed ? C.ok : cur ? C.accent : C.indigo, badge: r?.passed ? '合格' : '' }, () => this.app.go(new Exam(this.app, lv)));
    });
    ui.para('현재 단계의 모의고사에 합격하면 다음 단계가 열립니다. 문제는 매번 무작위로 새로 출제되며, 점수는 JLPT처럼 180점 만점(N4·N5는 언어지식·독해 120 + 청해 60)으로 환산합니다.', 60, 940, ui.w - 120, { size: 30, color: C.dim });
  }
}

class PassageView {
  constructor(app, task) {
    this.app = app;
    this.t = task;
  }

  draw(ui) {
    ui.header('지문', { back: () => this.app.back() });
    ui.rect(60, 140, ui.w - 120, 1000, 26, '#f6f0e2');
    let y = 180;
    for (const p of this.t.x) {
      const L = ui.layout(p, ui.w - 240, { size: 40 });
      if (y + L.h > 1120) break;
      ui.rich(p, 120, y, ui.w - 240, { layout: L, color: '#1d1b18', rubyColor: '#6d6558' });
      y += L.h + 24;
    }
    ui.button(ui.w - 560, ui.h - 120, 500, 96, '문제로 돌아가기', () => this.app.back(), { style: 'primary', size: 38, key: 'next' });
  }
}

export class Exam {
  constructor(app, lv) {
    this.app = app;
    this.lv = lv;
    this.steps = buildExam(lv);
    this.i = -1; // intro
    this.answers = [];
    this.card = null;
    this.result = null;
    this.wrongPage = 0;
  }

  exit() {
    this.app.sound.stop();
  }

  get step() {
    return this.steps[this.i];
  }

  next() {
    this.card = null;
    this.i++;
    if (this.i >= this.steps.length) this.finish();
    this.app.redraw();
  }

  onKey(k) {
    const s = this.step;
    if (this.result) return false;
    if (s?.kind === 'q' && this.card) {
      if (this.card.onKey(k)) return true;
      if (k === 'next' && this.card.answered) {
        this.next();
        return true;
      }
      return k === 'next';
    }
    return false;
  }

  score() {
    const sec = {};
    for (const a of this.answers) {
      sec[a.sec] = sec[a.sec] || { ok: 0, n: 0 };
      sec[a.sec].n++;
      if (a.ok) sec[a.sec].ok++;
    }
    const frac = (keys) => {
      let ok = 0;
      let n = 0;
      for (const k of keys) {
        ok += sec[k]?.ok || 0;
        n += sec[k]?.n || 0;
      }
      return n ? ok / n : 0;
    };
    if (this.lv === 'kana') {
      const f = frac(['kana']);
      const s = Math.round(f * 100);
      return { parts: [['문자', s, 100, 80]], total: s, max: 100, pass: s >= 80 };
    }
    const P = PASS[this.lv];
    let parts;
    if (P.secs.length === 3) {
      parts = [
        ['lang', Math.round(frac(['vocab', 'grammar']) * 60), 60, 19],
        ['read', Math.round(frac(['read']) * 60), 60, 19],
        ['listen', Math.round(frac(['listen']) * 60), 60, 19],
      ];
    } else {
      parts = [
        ['langread', Math.round(frac(['vocab', 'grammar', 'read']) * 120), 120, 38],
        ['listen', Math.round(frac(['listen']) * 60), 60, 19],
      ];
    }
    parts = parts.map(([k, s, m, min]) => [SEC_NAME[k], s, m, min]);
    const total = parts.reduce((a, p) => a + p[1], 0);
    const pass = total >= P.total && parts.every((p) => p[1] >= p[3]);
    return { parts, total, max: 180, pass, need: P.total };
  }

  finish() {
    const r = this.score();
    this.result = r;
    const prev = store.d.exams[this.lv] || { best: 0, passed: false, tries: 0 };
    store.d.exams[this.lv] = { best: Math.max(prev.best, r.total), passed: prev.passed || r.pass, tries: (prev.tries || 0) + 1, date: Date.now(), last: r.total };
    touchStreak();
    this.promoted = false;
    if (r.pass) {
      store.d.stats.xp += 200;
      if (store.d.stage === this.lv) {
        advanceStage();
        this.promoted = true;
        this.app.applySeason();
      }
      this.app.burst(true);
      this.app.sound.sfx('level');
      this.app.mascot.cheer();
    }
    store.save(true);
  }

  draw(ui) {
    if (this.i < 0) return this.drawIntro(ui);
    if (this.result) return this.drawResult(ui);
    const s = this.step;
    const qn = this.steps.filter((x) => x.kind === 'q').length;
    const done = this.answers.length;
    ui.header(`${STAGE_NAME[this.lv]} 모의고사`, { back: () => this.app.back() });
    ui.bar(700, 62, 800, 14, done / qn, C.indigo);
    if (s.kind === 'banner') {
      const cx = ui.w / 2;
      ui.text(s.title, cx, 480, { size: 76, weight: 700, align: 'center' });
      ui.text(s.sub, cx, 580, { size: 38, color: C.sub, align: 'center' });
      ui.button(cx - 250, 900, 500, 120, '시작 ▶', () => this.next(), { style: 'primary', size: 44, key: 'next' });
      return;
    }
    if (s.kind === 'passage') {
      ui.rect(60, 140, ui.w - 120, 960, 26, '#f6f0e2');
      let y = 180;
      for (const p of s.task.x) {
        const L = ui.layout(p, ui.w - 240, { size: 40 });
        if (y + L.h > 1080) break;
        ui.rich(p, 120, y, ui.w - 240, { layout: L, color: '#1d1b18', rubyColor: '#6d6558' });
        y += L.h + 24;
      }
      ui.button(ui.w - 560, ui.h - 150, 500, 100, '문제 풀기 ▶', () => this.next(), { style: 'primary', size: 40, key: 'next' });
      return;
    }
    if (!this.card) {
      this.card = new QuizCard(this.app, s.q, {
        exam: true,
        showKo: false,
        onAnswer: (ok) => this.answers.push({ sec: s.sec, ok, q: s.q, chosen: this.card.chosen }),
      });
    }
    this.card.draw(ui, 140, `${done + (this.card.answered ? 0 : 1)} / ${qn}`);
    if (s.kind === 'q' && s.sec === 'read' && !this.card.answered) {
      ui.button(ui.w - 400, 26, 340, 84, '지문 보기', () => this.app.go(new PassageView(this.app, s.task)), { style: 'ghost', size: 32 });
    }
    if (this.card.answered) ui.button(ui.w - 330, 26, 270, 84, '다음 ▶', () => this.next(), { style: 'primary', size: 38, key: 'next' });
  }

  drawIntro(ui) {
    ui.header(`${STAGE_NAME[this.lv]} 모의고사`, { back: () => this.app.back() });
    const qn = this.steps.filter((x) => x.kind === 'q').length;
    const X = 140;
    ui.text(`총 ${qn}문제`, X, 260, { size: 60, weight: 700 });
    let y = 340;
    const secs = {};
    for (const s of this.steps) if (s.kind === 'q') secs[s.sec] = (secs[s.sec] || 0) + 1;
    const names = { vocab: '문자·어휘', grammar: '문법', read: '독해', listen: '청해', kana: '문자' };
    for (const [k, n] of Object.entries(secs)) {
      ui.text(`• ${names[k]}  ${n}문제`, X, y, { size: 40 });
      y += 64;
    }
    y += 20;
    const note = this.lv === 'kana'
      ? '80점 이상이면 합격, N5 단계가 열립니다.'
      : `합격 기준: 총점 ${PASS[this.lv].total}/180 이상 + 모든 영역 기준점 이상 (실제 JLPT와 같은 방식). 정답은 시험이 끝난 뒤에 공개됩니다.`;
    ui.para(note, X, y, ui.w - 280, { size: 34, color: C.sub });
    if (store.d.stage === this.lv) ui.para('지금 단계의 시험입니다. 합격하면 다음 단계로 올라가고 정원의 계절이 바뀝니다!', X, y + 120, ui.w - 280, { size: 34, color: C.accent2 });
    ui.button(ui.w / 2 - 250, 1040, 500, 120, '시험 시작 ▶', () => this.next(), { style: 'primary', size: 44, key: 'next', color: C.indigo });
  }

  drawResult(ui) {
    const r = this.result;
    ui.header(`${STAGE_NAME[this.lv]} 모의고사 결과`, { back: () => this.app.back() });
    const cx = ui.w / 2;
    ui.text(r.pass ? '合格' : '不合格', 330, 330, { size: 170, weight: 700, color: r.pass ? C.accent : C.dim, align: 'center' });
    ui.text(`${r.total} / ${r.max}`, 330, 480, { size: 70, weight: 700, align: 'center' });
    if (r.need) ui.text(`합격선 ${r.need}`, 330, 550, { size: 30, color: C.sub, align: 'center' });
    let y = 220;
    for (const [name, s, m, min] of r.parts) {
      ui.text(name, 700, y, { size: 36, weight: 600 });
      ui.bar(700, y + 36, 900, 26, s / m, s >= min ? C.ok : C.ng);
      ui.text(`${s} / ${m}`, 1640, y + 49, { size: 34, weight: 700 });
      ui.text(`기준점 ${min}`, 1800, y + 49, { size: 26, color: C.dim });
      y += 130;
    }
    const wrong = this.answers.filter((a) => !a.ok);
    y = Math.max(y, 640);
    if (this.promoted) {
      const nx = store.d.stage;
      ui.text(nx === 'done' ? '축하합니다! N1 과정을 모두 마쳤어요!' : `축하합니다! ${STAGE_NAME[nx]} 단계가 열렸어요`, cx, y, { size: 44, weight: 700, color: C.accent2, align: 'center' });
      y += 70;
    }
    ui.text(`틀린 문제 ${wrong.length}개`, 80, y + 20, { size: 34, weight: 700, color: C.ng });
    y += 60;
    const per = 4;
    const pages = Math.max(1, Math.ceil(wrong.length / per));
    wrong.slice(this.wrongPage * per, this.wrongPage * per + per).forEach((a) => {
      const p = a.q.prompt;
      const promptText = p.sentence ? p.sentence.replace(/[{}]/g, '') : p.word || p.big || '';
      ui.rich(`${promptText}  →  ${a.q.options[a.q.answer].label}`, 100, y, ui.w - 200, { size: 32, maxLines: 1, furigana: false });
      y += 64;
    });
    if (pages > 1) {
      ui.button(80, ui.h - 140, 110, 90, '◀', () => { this.wrongPage = Math.max(0, this.wrongPage - 1); }, { style: 'ghost', key: 'left' });
      ui.text(`${this.wrongPage + 1}/${pages}`, 250, ui.h - 95, { size: 30, color: C.sub, align: 'center' });
      ui.button(310, ui.h - 140, 110, 90, '▶', () => { this.wrongPage = Math.min(pages - 1, this.wrongPage + 1); }, { style: 'ghost', key: 'right' });
    }
    ui.button(ui.w - 1100, ui.h - 140, 500, 100, '다시 응시', () => this.app.replace(new Exam(this.app, this.lv)), { style: 'ghost', size: 38 });
    ui.button(ui.w - 560, ui.h - 140, 500, 100, '홈으로 ▶', () => this.app.home(), { style: 'primary', size: 40, key: 'next' });
  }
}
