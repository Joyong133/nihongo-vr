// "오늘의 학습": the guided daily session.
//   1) SRS reviews  2) new items: teach cards → check quiz (repeat until right)
//   3) one reading or listening task  4) summary
import { C, TYPE_NAME, TYPE_COLOR } from '../ui/theme.js';
import { store, dayStats, touchStreak, STAGE_NAME } from '../core/store.js';
import { DB } from '../core/db.js';
import { planToday, etaDays, allIntroduced } from '../core/curriculum.js';
import { grade, learn, markKnown, isKnown } from '../core/srs.js';
import { makeQuestion, shuffle } from '../core/quiz.js';
import { QuizCard, drawTeach, speakItem } from './common.js';

function chunk(a, n) {
  const out = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export class Session {
  constructor(app, { reviewOnly = false, extraRound = false } = {}) {
    this.app = app;
    this.reviewOnly = reviewOnly;
    this.plan = planToday();
    if (extraRound) {
      // "한 번 더": pretend today's quota is fresh
      dayStats().nk = {};
      this.plan = planToday();
    }
    this.steps = [];
    this.i = 0;
    this.stats = { ok: 0, ng: 0, newN: 0, rev: 0, xp: 0 };
    this.started = Date.now();
    this.build();
    this.phase = 'intro';
  }

  build() {
    const P = this.plan;
    const steps = [];
    // reviews
    const revItems = shuffle(P.reviews.map((id) => DB.byId.get(id)).filter(Boolean));
    if (revItems.length) {
      steps.push({ kind: 'banner', title: '복습', sub: `잊어버리기 직전의 ${revItems.length}개를 다시 확인합니다`, color: C.accent2 });
      for (const it of revItems) steps.push({ kind: 'review', it });
    }
    if (!this.reviewOnly) {
      const batches = [];
      for (const g of P.kana) {
        for (const part of chunk(g.items.filter((x) => !isKnown(x.id)), 6)) batches.push({ type: 'kana', items: part, title: g.name, tip: g.tip });
      }
      for (const part of chunk(P.kanji, 5)) batches.push({ type: 'kanji', items: part, title: '새 한자' });
      for (const part of chunk(P.vocab, 5)) batches.push({ type: 'vocab', items: part, title: '새 단어' });
      for (const g of P.grammar) batches.push({ type: 'grammar', items: [g], title: '새 문법' });
      batches.forEach((b, bi) => {
        steps.push({ kind: 'banner', title: b.title, sub: b.type === 'grammar' ? '패턴과 예문을 듣고 따라 읽어 보세요' : `${b.items.length}개를 배우고 바로 확인 문제를 풉니다`, color: TYPE_COLOR[b.type], batch: bi + 1, batches: batches.length, type: b.type });
        b.items.forEach((it, k) => steps.push({ kind: 'teach', it, k, n: b.items.length }));
        const qs = b.type === 'grammar' ? [b.items[0], b.items[0]] : shuffle(b.items);
        for (const it of qs) steps.push({ kind: 'check', it, batchItems: b.items });
      });
      if (P.extra) steps.push({ kind: 'extra', task: P.extra });
    }
    steps.push({ kind: 'summary' });
    this.steps = steps;
  }

  get step() {
    return this.steps[this.i];
  }

  exit() {
    const ds = dayStats();
    ds.sec += Math.round((Date.now() - this.started) / 1000);
    this.started = Date.now();
    store.save();
  }

  pause() {
    this.exit();
  }

  resume() {
    this.started = Date.now();
    // coming back from a reading/listening task
    if (this.step?.kind === 'extra' && this.extraOpened) this.next();
  }

  next() {
    this.i = Math.min(this.steps.length - 1, this.i + 1);
    this.card = null;
    const s = this.step;
    if (s.kind === 'teach' && store.d.settings.autoplay) setTimeout(() => speakItem(this.app, s.it), 200);
    if (s.kind === 'summary') this.finish();
    this.app.redraw();
  }

  counts() {
    const n = { review: 0, teach: 0 };
    let done = { review: 0, teach: 0 };
    this.steps.forEach((s, i) => {
      if (s.kind === 'review' || s.kind === 'teach') {
        n[s.kind]++;
        if (i < this.i) done[s.kind]++;
      }
    });
    return { n, done };
  }

  answer(ok, q) {
    const s = this.step;
    const ds = dayStats();
    touchStreak();
    if (ok) this.stats.ok++;
    else this.stats.ng++;
    if (ok) ds.ok++;
    else ds.ng++;
    if (s.kind === 'review') {
      if (!s.retry) {
        grade(s.it.id, ok);
        ds.r++;
        this.stats.rev++;
        if (ok) this.addXP(2);
      }
      if (!ok) this.steps.splice(Math.min(this.steps.length - 1, this.i + 6), 0, { kind: 'review', it: s.it, retry: true });
    } else if (s.kind === 'check') {
      if (!isKnown(s.it.id)) {
        learn(s.it.id);
        ds.n++;
        const nk = ds.nk || (ds.nk = {});
        const t = s.it.type === 'kana' ? 'kanaItems' : s.it.type;
        nk[t] = (nk[t] || 0) + 1;
        this.stats.newN++;
        this.addXP(10);
        this.countKanaGroup(s.it);
      }
      if (!ok) {
        // re-teach later in this batch
        let j = this.i + 1;
        while (j < this.steps.length && this.steps[j].kind === 'check') j++;
        this.steps.splice(j, 0, { kind: 'teach', it: s.it, k: 0, n: 1, again: true }, { kind: 'check', it: s.it, retry: true });
      }
    }
    store.save();
  }

  countKanaGroup(it) {
    const ds = dayStats();
    const nk = ds.nk || (ds.nk = {});
    const P = this.plan;
    for (const g of P.kana) {
      if (g.items.some((x) => x.id === it.id) && g.items.every((x) => isKnown(x.id))) nk.kana = (nk.kana || 0) + 1;
    }
  }

  addXP(n) {
    store.d.stats.xp += n;
    this.stats.xp += n;
  }

  skipKnown() {
    // "이미 알아요": mark known and drop its check questions
    const it = this.step.it;
    markKnown(it.id);
    const ds = dayStats();
    const nk = ds.nk || (ds.nk = {});
    const t = it.type === 'kana' ? 'kanaItems' : it.type;
    nk[t] = (nk[t] || 0) + 1;
    this.countKanaGroup(it);
    this.steps = this.steps.filter((s, i) => i <= this.i || !(s.kind === 'check' && s.it.id === it.id));
    store.save();
    this.app.toast('이미 아는 항목으로 표시했어요');
    this.next();
  }

  finish() {
    store.save(true);
    this.app.burst(true);
    this.app.sound.sfx('level');
    this.app.mascot.cheer();
  }

  onKey(k) {
    if (this.phase === 'intro') return false;
    const s = this.step;
    if ((s.kind === 'review' || s.kind === 'check') && this.card) {
      if (this.card.onKey(k)) return true;
      if (k === 'next' && this.card.answered) {
        this.next();
        return true;
      }
      return k === 'next';
    }
    if (k === 'next' && (s.kind === 'teach' || s.kind === 'banner' || s.kind === 'intro')) {
      this.next();
      return true;
    }
    if (k === 'audio' && s.kind === 'teach') {
      speakItem(this.app, s.it);
      return true;
    }
    return false;
  }

  draw(ui) {
    if (this.phase === 'intro') return this.drawIntro(ui);
    const s = this.step;
    const { n, done } = this.counts();
    const prog = this.i / Math.max(1, this.steps.length - 1);
    ui.header(this.reviewOnly ? '복습' : '오늘의 학습', { back: () => this.app.back() });
    ui.bar(700, 62, 900, 14, prog, C.accent2);
    ui.text(`복습 ${done.review}/${n.review} · 새 항목 ${done.teach}/${n.teach}`, 1150, 102, { size: 26, color: C.dim, align: 'center' });
    if (s.kind === 'banner') return this.drawBanner(ui, s);
    if (s.kind === 'teach') return this.drawTeach(ui, s);
    if (s.kind === 'review' || s.kind === 'check') return this.drawQuiz(ui, s);
    if (s.kind === 'extra') return this.drawExtra(ui, s);
    if (s.kind === 'summary') return this.drawSummary(ui);
  }

  drawIntro(ui) {
    const P = this.plan;
    ui.header(this.reviewOnly ? '복습' : '오늘의 학습', { back: () => this.app.back() });
    const X = 120;
    let y = 190;
    const stage = STAGE_NAME[store.d.stage];
    ui.text(this.reviewOnly ? '지금 복습할 항목' : `${stage} 단계 · 오늘의 계획`, X, y + 30, { size: 52, weight: 700 });
    y += 110;
    const rows = [];
    if (P.reviews.length) rows.push(['복습', `${P.reviews.length}개`, C.accent2, '기억이 흐려질 때쯤 다시 묻습니다']);
    if (!this.reviewOnly) {
      const kanaN = P.kana.reduce((a, g) => a + g.items.filter((x) => !isKnown(x.id)).length, 0);
      if (kanaN) rows.push(['가나', `${kanaN}자`, C.kana, P.kana.map((g) => g.name).join(', ')]);
      if (P.kanji.length) rows.push(['새 한자', `${P.kanji.length}자`, C.kanji, P.kanji.map((k) => k.c).join(' ')]);
      if (P.vocab.length) rows.push(['새 단어', `${P.vocab.length}개`, C.vocab, P.vocab.slice(0, 8).map((v) => v.w).join('、') + (P.vocab.length > 8 ? ' …' : '')]);
      if (P.grammar.length) rows.push(['새 문법', `${P.grammar.length}개`, C.grammar, P.grammar.map((g) => g.p).join('  ')]);
      if (P.extra) rows.push([P.extra.type === 'reading' ? '독해' : '청해', '1개', TYPE_COLOR[P.extra.type], P.extra.t]);
    }
    if (!rows.length) {
      const lv = store.d.stage;
      ui.para(lv === 'done' ? 'N1 과정을 모두 마쳤습니다! 복습과 모의고사로 실력을 유지하세요.' : allIntroduced(lv) ? `${STAGE_NAME[lv]}의 모든 항목을 배웠어요. 로드맵에서 ${STAGE_NAME[lv]} 모의고사에 합격하면 다음 단계가 열립니다.` : '오늘 분량을 모두 마쳤어요! 내일 다시 만나요. 더 하고 싶다면 홈에서 “한 번 더”를 누르세요.', X, y, 1800, { size: 40, color: C.sub });
      ui.button(X, 1080, 420, 110, '홈으로', () => this.app.back(), { style: 'primary', key: 'next' });
      return;
    }
    for (const [name, count, col, detail] of rows) {
      ui.rect(X, y, 1808, 118, 24, C.card, C.line);
      ui.circle(X + 60, y + 59, 18, col);
      ui.text(name, X + 100, y + 59, { size: 40, weight: 700 });
      ui.text(count, X + 330, y + 59, { size: 40, weight: 700, color: col });
      ui.rich(detail, X + 520, y + 30, 1260, { size: 32, color: C.sub, maxLines: 1, furigana: false });
      y += 134;
    }
    const mins = Math.round(P.reviews.length * 0.15 + (P.kanji.length + P.vocab.length) * 0.6 + P.grammar.length * 3 + (P.extra ? 5 : 0) + P.kana.length * 4);
    ui.text(`예상 소요 시간 약 ${Math.max(3, mins)}분 · N1까지 남은 일수 약 ${etaDays()}일`, X, 1010, { size: 32, color: C.dim });
    ui.button(ui.w - 620, 1070, 500, 120, '시작하기 ▶', () => {
      this.phase = 'run';
      this.i = 0;
      this.app.redraw();
    }, { style: 'primary', size: 46, key: 'next' });
  }

  drawBanner(ui, s) {
    const cx = ui.w / 2;
    ui.circle(cx, 480, 150, s.color);
    const icon = { kana: 'あ', kanji: '字', vocab: '語', grammar: '文' }[s.type] || '復';
    ui.text(icon, cx, 488, { size: 160, weight: 700, color: '#1a1f2c', align: 'center' });
    ui.text(s.title, cx, 720, { size: 72, weight: 700, align: 'center' });
    ui.text(s.sub, cx, 810, { size: 38, color: C.sub, align: 'center', maxW: 1700 });
    if (s.batch) ui.text(`새 학습 ${s.batch} / ${s.batches}`, cx, 880, { size: 30, color: C.dim, align: 'center' });
    ui.button(cx - 250, 1010, 500, 120, '계속 ▶', () => this.next(), { style: 'primary', size: 44, key: 'next' });
  }

  drawTeach(ui, s) {
    drawTeach(this.app, ui, s.it, 150);
    const y = ui.h - 130;
    ui.text(s.again ? '다시 한 번 보고 가요' : `${s.k + 1} / ${s.n}`, 80, y + 55, { size: 34, color: s.again ? C.ng : C.dim });
    if (!s.again && !isKnown(s.it.id)) ui.button(ui.w - 1100, y, 440, 100, '이미 알아요 (건너뛰기)', () => this.skipKnown(), { style: 'ghost', size: 32 });
    ui.button(ui.w - 620, y, 560, 100, '외웠어요 ▶', () => this.next(), { style: 'primary', size: 42, key: 'next' });
  }

  drawQuiz(ui, s) {
    if (!this.card || this.card.step !== s) {
      const q = makeQuestion(s.it, s.kind === 'check' && s.it.type === 'grammar' && s.retry ? 'blank' : undefined);
      this.card = new QuizCard(this.app, q, { onAnswer: (ok, qq) => this.answer(ok, qq) });
      this.card.step = s;
    }
    const label = s.kind === 'review' ? (s.retry ? '틀렸던 문제 다시' : '복습') : '확인 문제';
    this.card.draw(ui, 140, label);
    if (this.card.answered) ui.button(ui.w - 330, 26, 270, 84, '다음 ▶', () => this.next(), { style: 'primary', size: 38, key: 'next' });
  }

  drawExtra(ui, s) {
    const t = s.task;
    const cx = ui.w / 2;
    ui.circle(cx, 460, 150, TYPE_COLOR[t.type]);
    ui.text(t.type === 'reading' ? '読' : '聴', cx, 468, { size: 160, weight: 700, color: '#1a1f2c', align: 'center' });
    ui.text(t.type === 'reading' ? '오늘의 독해' : '오늘의 청해', cx, 700, { size: 64, weight: 700, align: 'center' });
    ui.rich(t.t, 300, 760, ui.w - 600, { size: 44, align: 'center', color: C.sub });
    ui.button(cx - 560, 1010, 500, 120, '건너뛰기', () => {
      dayStats().extraDone = true;
      this.next();
    }, { style: 'ghost', size: 40 });
    ui.button(cx + 60, 1010, 500, 120, '시작 ▶', async () => {
      const mod = await import('./reading.js');
      this.extraOpened = true;
      dayStats().extraDone = true;
      this.app.go(t.type === 'reading' ? new mod.ReadingView(this.app, t) : new mod.ListeningView(this.app, t));
    }, { style: 'primary', size: 44, key: 'next' });
  }

  drawSummary(ui) {
    const st = this.stats;
    const cx = ui.w / 2;
    ui.text('수고했어요! お疲れさまでした', cx, 260, { size: 70, weight: 700, align: 'center', color: C.accent2 });
    const acc = st.ok + st.ng ? Math.round((st.ok / (st.ok + st.ng)) * 100) : 100;
    const cards = [
      ['새로 배운 항목', `${st.newN}`],
      ['복습', `${st.rev}`],
      ['정답률', `${acc}%`],
      ['획득 XP', `+${st.xp}`],
      ['연속 학습', `${store.d.stats.streak}일`],
    ];
    const w = 330;
    let x = cx - (cards.length * (w + 24) - 24) / 2;
    for (const [k, v] of cards) {
      ui.rect(x, 380, w, 220, 26, C.card, C.line);
      ui.text(v, x + w / 2, 470, { size: 80, weight: 700, align: 'center' });
      ui.text(k, x + w / 2, 560, { size: 30, color: C.sub, align: 'center' });
      x += w + 24;
    }
    const eta = etaDays();
    const d = new Date(Date.now() + eta * 86400000);
    ui.text(`지금 속도라면 N1 완주까지 약 ${eta}일 — ${d.getFullYear()}년 ${d.getMonth() + 1}월 예상`, cx, 700, { size: 38, color: C.ink, align: 'center' });
    ui.text('다음 복습은 4시간 뒤부터 열립니다. 내일도 이 자리에서 만나요!', cx, 770, { size: 32, color: C.sub, align: 'center' });
    ui.button(cx - 560, 1000, 500, 120, '홈으로', () => this.app.home(), { style: 'primary', size: 44, key: 'next' });
    ui.button(cx + 60, 1000, 500, 120, '한 번 더 (추가 분량)', () => this.app.replace(new Session(this.app, { extraRound: true })), { style: 'ghost', size: 38 });
  }
}
