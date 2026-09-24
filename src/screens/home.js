// Home hub and first-run onboarding.
import { C } from '../ui/theme.js';
import { store, STAGE_NAME, PACES, STAGES, dayStats } from '../core/store.js';
import { DB, LEVELS } from '../core/db.js';
import { planToday, planSize, levelProgress, etaDays, totalDaysAtPace, allIntroduced } from '../core/curriculum.js';
import { dueIds, markKnown } from '../core/srs.js';
import { KANA } from '../core/kana.js';
import { SEASONS, STAGE_SEASON } from '../env.js';
import { Session } from './session.js';

// Explicit loaders so the bundler can split each screen module into its own chunk.
const SCREENS = {
  browse: () => import('./browse.js'),
  reading: () => import('./reading.js'),
  practice: () => import('./practice.js'),
  exam: () => import('./exam.js'),
  misc: () => import('./misc.js'),
};

export class Home {
  constructor(app) {
    this.app = app;
  }

  resume() {
    this.app.applySeason();
  }

  draw(ui) {
    const d = store.d;
    const stage = d.stage;
    ui.text('にほんご VR', 60, 72, { size: 56, weight: 700, color: C.accent2 });
    ui.text('기초부터 N1까지, 떠먹여 주는 일본어', 440, 76, { size: 32, color: C.sub });
    let cx = ui.w - 60;
    const chips = [
      [`XP ${d.stats.xp.toLocaleString()}`, C.accent2],
      [`연속 ${d.stats.streak}일`, C.accent],
      [`현재 ${STAGE_NAME[stage]}`, C.indigo],
    ];
    for (const [label, col] of chips) {
      const w = ui.measure(label, 28, 700) + 34;
      cx -= w;
      ui.chip(cx, 44, label, col, { size: 28 });
      cx -= 16;
    }

    // --- today card
    const X = 60;
    const Y = 150;
    const W = 1000;
    const H = 1070;
    ui.rect(X, Y, W, H, 34, C.card, C.line);
    const plan = planToday();
    const size = planSize(plan) + (plan.extra ? 1 : 0);
    const season = SEASONS[STAGE_SEASON[stage]]?.name || '';
    ui.text(`${STAGE_NAME[stage]} 단계`, X + 50, Y + 70, { size: 60, weight: 700 });
    ui.text(`${season} 정원`, X + 50 + ui.measure(`${STAGE_NAME[stage]} 단계`, 60, 700) + 30, Y + 76, { size: 32, color: C.sub });
    if (stage !== 'done') {
      const p = levelProgress(stage);
      ui.text('진도', X + 50, Y + 150, { size: 28, color: C.sub });
      ui.bar(X + 150, Y + 140, W - 330, 22, p.frac, C.accent2);
      ui.text(`${Math.round(p.frac * 100)}%`, X + W - 50, Y + 151, { size: 30, weight: 700, align: 'right' });
      ui.text('숙련', X + 50, Y + 200, { size: 28, color: C.sub });
      ui.bar(X + 150, Y + 190, W - 330, 22, p.mastery, C.ok);
      ui.text(`${Math.round(p.mastery * 100)}%`, X + W - 50, Y + 201, { size: 30, weight: 700, align: 'right' });
    }
    let y = Y + 270;
    ui.text('오늘의 학습', X + 50, y, { size: 36, weight: 700, color: C.accent2 });
    y += 40;
    const rows = [];
    if (plan.reviews.length) rows.push(['복습', `${plan.reviews.length}개`, C.accent2]);
    const kanaN = plan.kana.reduce((a, g) => a + g.items.length, 0);
    if (kanaN) rows.push(['가나', `${plan.kana.map((g) => g.name.replace(/^(히라가나|가타카나) /, '')).join(', ')}`, C.kana]);
    if (plan.kanji.length) rows.push(['새 한자', `${plan.kanji.length}자`, C.kanji]);
    if (plan.vocab.length) rows.push(['새 단어', `${plan.vocab.length}개`, C.vocab]);
    if (plan.grammar.length) rows.push(['새 문법', `${plan.grammar.length}개`, C.grammar]);
    if (plan.extra) rows.push([plan.extra.type === 'reading' ? '독해' : '청해', '1개', plan.extra.type === 'reading' ? C.reading : C.listening]);
    if (!rows.length) {
      const msg = stage === 'done' ? 'N1 과정을 모두 마쳤습니다. 복습과 모의고사로 실력을 지키세요!'
        : allIntroduced(stage) ? `${STAGE_NAME[stage]} 항목을 모두 배웠어요! 로드맵에서 ${STAGE_NAME[stage]} 모의고사에 합격하면 다음 단계로 올라갑니다.`
          : '오늘 분량 끝! 잘했어요. 더 하고 싶으면 “한 번 더”를 누르세요.';
      y += ui.para(msg, X + 50, y + 10, W - 100, { size: 34, color: C.sub }) + 30;
    } else {
      for (const [k, v, col] of rows) {
        ui.circle(X + 66, y + 30, 11, col);
        ui.text(k, X + 92, y + 30, { size: 36, weight: 600 });
        ui.text(v, X + 300, y + 30, { size: 36, color: C.ink, maxW: W - 360 });
        y += 58;
      }
    }
    const eta = etaDays();
    const dd = new Date(Date.now() + eta * 86400000);
    if (stage !== 'done') ui.text(`N1 완주까지 약 ${eta}일 · ${dd.getFullYear()}년 ${dd.getMonth() + 1}월 예상 (${PACES[d.settings.pace].name} 속도)`, X + 50, Y + H - 200, { size: 28, color: C.dim, maxW: W - 100 });
    if (size) {
      ui.button(X + 50, Y + H - 150, W - 100, 110, '오늘의 학습 시작 ▶', () => this.app.go(new Session(this.app)), { style: 'primary', size: 46, key: 'next' });
    } else if (allIntroduced(stage) && stage !== 'done') {
      ui.button(X + 50, Y + H - 150, W - 100, 110, `${STAGE_NAME[stage]} 모의고사 도전 ▶`, async () => {
        const m = await import('./exam.js');
        this.app.go(new m.Exam(this.app, stage));
      }, { style: 'primary', size: 44, key: 'next', color: C.indigo });
    } else {
      ui.button(X + 50, Y + H - 150, W - 100, 110, '한 번 더 (추가 분량) ▶', () => this.app.go(new Session(this.app, { extraRound: true })), { style: 'primary', size: 42, key: 'next', color: C.indigo });
    }

    // --- tiles
    const due = dueIds().length;
    const cur = stage === 'kana' || stage === 'done' ? 'n5' : stage;
    const tiles = [
      ['道', '로드맵', 'N5 → N1 진도 · 레벨 시험', C.accent2, () => this.open('misc', 'Roadmap')],
      ['復', '복습만 하기', due ? `지금 ${due}개 대기` : '대기 중인 복습 없음', C.accent, () => this.app.go(new Session(this.app, { reviewOnly: true })), due ? String(due) : ''],
      ['字', '가나 · 한자', `한자 ${LEVELS.reduce((a, l) => a + DB.levels[l].kanji.length, 0).toLocaleString()}자`, C.kanji, () => this.open('browse', 'CharMenu')],
      ['語', '단어장', `${LEVELS.reduce((a, l) => a + DB.levels[l].vocab.length, 0).toLocaleString()}단어`, C.vocab, () => this.open('browse', 'VocabList', cur)],
      ['文', '문법 사전', `${LEVELS.reduce((a, l) => a + DB.levels[l].grammar.length, 0)}개 패턴`, C.grammar, () => this.open('browse', 'GrammarList', cur)],
      ['読', '독해', `${LEVELS.reduce((a, l) => a + DB.levels[l].reading.length, 0)}개 지문`, C.reading, () => this.open('reading', 'ReadingList', cur)],
      ['聴', '청해', `${LEVELS.reduce((a, l) => a + DB.levels[l].listening.length, 0)}개 대화 · 섀도잉`, C.listening, () => this.open('reading', 'ListeningList', cur)],
      ['練', '활용 · 숫자 연습', '동사 활용 · 조수사', C.kana, () => this.open('practice', 'PracticeMenu')],
      ['試', '모의고사', 'JLPT 형식 · 합격 판정', C.indigo, () => this.open('exam', 'ExamMenu')],
      ['績', '학습 기록', '달력 · 정답률 · 단계', C.ok, () => this.open('misc', 'Stats')],
      ['案', 'JLPT · 사용법', '시험 정보 · 공부법 · 조작', C.reading, () => this.open('misc', 'Guide')],
      ['設', '설정', '속도 · 음성 · 배경', C.dim, () => this.open('misc', 'Settings')],
    ];
    const tx = 1090;
    const tw = (ui.w - tx - 60 - 20) / 2;
    const th = (1070 - 5 * 16) / 6;
    tiles.forEach(([icon, title, sub, color, fn, badge], i) => {
      const x = tx + (i % 2) * (tw + 20);
      const yy = Y + Math.floor(i / 2) * (th + 16);
      ui.tile(x, yy, tw, th, { icon, title, sub, color, badge }, fn);
    });
  }

  async open(mod, cls, arg) {
    const m = await SCREENS[mod]();
    this.app.go(new m[cls](this.app, arg));
  }
}

// ================================================================ onboarding
export class Onboarding {
  constructor(app) {
    this.app = app;
    this.step = 0;
    this.start = 'kana';
  }

  finish() {
    const d = store.d;
    // placement: everything before the chosen stage counts as known
    const idx = STAGES.indexOf(this.start);
    for (let i = 0; i < idx; i++) {
      const lv = STAGES[i];
      if (lv === 'kana') KANA.all.forEach((k) => markKnown(k.id));
      else for (const t of ['kanji', 'vocab', 'grammar']) DB.levels[lv][t].forEach((it) => markKnown(it.id));
    }
    d.stage = this.start;
    d.onboarded = true;
    dayStats();
    store.save(true);
    this.app.applySeason();
    this.app.replace(new Home(this.app));
    this.app.toast('준비 완료! “오늘의 학습 시작”을 눌러 보세요');
  }

  onKey(k) {
    if (k === 'next' && this.step < 2) {
      this.step++;
      return true;
    }
    return false;
  }

  draw(ui) {
    const cx = ui.w / 2;
    ui.text('にほんご VR', cx, 120, { size: 72, weight: 700, color: C.accent2, align: 'center' });
    ui.text(['환영합니다', '어디서부터 시작할까요?', '하루 학습량을 정해요'][this.step], cx, 210, { size: 44, weight: 600, align: 'center' });
    for (let i = 0; i < 3; i++) ui.circle(cx - 40 + i * 40, 262, 9, i === this.step ? C.accent2 : 'rgba(255,255,255,0.2)');
    if (this.step === 0) {
      const lines = [
        '이 앱은 완전 초보부터 JLPT N1 합격까지, 매일 무엇을 공부할지 정해서 떠먹여 줍니다.',
        '매일 “오늘의 학습”만 누르면 복습 → 새 글자·한자·단어·문법 → 확인 문제 → 독해·청해가 차례로 나옵니다.',
        '잊어버릴 때쯤 다시 물어보는 간격 반복(SRS)으로 오래 기억하게 해 줍니다.',
        '단계가 오르면 정원의 계절이 바뀝니다: 봄(N5) → 여름(N4) → 가을(N3) → 겨울(N2) → 밤(N1).',
      ];
      let y = 330;
      for (const l of lines) y += ui.para(`• ${l}`, 200, y, ui.w - 400, { size: 38 }) + 18;
      const ctl = [
        ['가리키고 트리거(또는 엄지·검지 핀치)', '선택'],
        ['A / X 버튼', '다음 · 계속'],
        ['B / Y 버튼', '뒤로'],
        ['스틱 좌우', '페이지 넘기기'],
        ['스틱 누르기 / 그립', '화면을 내 앞으로'],
      ];
      y += 20;
      ui.rect(200, y, ui.w - 400, 60 + ctl.length * 56, 24, C.card, C.line);
      ui.text('Quest 조작법', 240, y + 42, { size: 32, weight: 700, color: C.accent2 });
      y += 76;
      for (const [a, b] of ctl) {
        ui.text(a, 260, y + 20, { size: 32 });
        ui.text(b, 1100, y + 20, { size: 32, color: C.sub });
        y += 56;
      }
      ui.button(cx - 250, 1100, 500, 110, '다음 ▶', () => { this.step = 1; }, { style: 'primary', size: 44, key: 'next' });
      return;
    }
    if (this.step === 1) {
      const opts = [
        ['kana', '완전 처음이에요', '히라가나·가타카나부터 (추천)'],
        ['n5', '가나는 읽을 수 있어요', 'N5부터 시작'],
        ['n4', 'N5 수준은 알아요', 'N4부터 시작'],
        ['n3', 'N4 수준은 알아요', 'N3부터 시작'],
        ['n2', 'N3 수준은 알아요', 'N2부터 시작'],
        ['n1', 'N2 수준은 알아요', 'N1부터 시작'],
      ];
      opts.forEach(([key, title, sub], i) => {
        const x = 200 + (i % 2) * 840;
        const y = 330 + Math.floor(i / 2) * 200;
        ui.button(x, y, 800, 170, title, () => { this.start = key; }, { sub, size: 44, state: this.start === key ? 'on' : null });
      });
      ui.para('건너뛴 단계의 항목은 “이미 앎”으로 표시되어 가끔 복습에만 나옵니다. 나중에 로드맵에서 바꿀 수 있어요.', 200, 960, ui.w - 400, { size: 30, color: C.dim });
      ui.button(200, 1100, 360, 110, '‹ 이전', () => { this.step = 0; }, { style: 'ghost', size: 38 });
      ui.button(ui.w - 700, 1100, 500, 110, '다음 ▶', () => { this.step = 2; }, { style: 'primary', size: 44, key: 'next' });
      return;
    }
    const keys = Object.keys(PACES);
    keys.forEach((k, i) => {
      const P = PACES[k];
      const days = totalDaysAtPace(k);
      const x = 200 + i * 560;
      ui.button(x, 360, 520, 380, P.name, () => {
        store.d.settings.pace = k;
      }, { sub: `${P.desc} · 새 단어 ${P.vocab}개/일`, size: 60, state: store.d.settings.pace === k ? 'on' : null });
      ui.text(`처음부터 N1까지 약 ${Math.round(days / 30)}개월`, x + 260, 690, { size: 30, color: C.accent2, align: 'center' });
    });
    ui.para('한자·문법·독해·청해는 단어 속도에 맞춰 자동으로 배분됩니다. 복습이 많이 쌓인 날엔 복습만 해도 괜찮아요. 속도는 설정에서 언제든 바꿀 수 있습니다.', 200, 800, ui.w - 400, { size: 32, color: C.sub });
    ui.button(200, 1100, 360, 110, '‹ 이전', () => { this.step = 1; }, { style: 'ghost', size: 38 });
    ui.button(ui.w - 700, 1100, 500, 110, '시작하기 ▶', () => this.finish(), { style: 'primary', size: 44, key: 'next' });
  }
}
