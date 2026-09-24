// Roadmap, settings, stats and the JLPT / how-to guide.
import { C } from '../ui/theme.js';
import { store, STAGES, STAGE_NAME, PACES, today } from '../core/store.js';
import { DB } from '../core/db.js';
import { levelProgress, etaDays, allIntroduced, quotas } from '../core/curriculum.js';
import { SEASONS, STAGE_SEASON } from '../env.js';
import { markKnown } from '../core/srs.js';
import { KANA } from '../core/kana.js';
import { PASS } from './exam.js';

// ================================================================ roadmap
export class Roadmap {
  constructor(app) {
    this.app = app;
    this.sel = STAGES.includes(store.d.stage) ? store.d.stage : 'n1';
    this.confirm = null;
  }

  draw(ui) {
    ui.header('학습 로드맵', { back: () => this.app.back() });
    const eta = etaDays();
    const dd = new Date(Date.now() + eta * 86400000);
    ui.text(store.d.stage === 'done' ? 'N1 과정 완주!' : `N1 완주까지 약 ${eta}일 (${dd.getFullYear()}.${dd.getMonth() + 1} 예상)`, ui.w - 60, 68, { size: 32, color: C.accent2, align: 'right' });
    const n = STAGES.length;
    const gap = 22;
    const cw = (ui.w - 120 - gap * (n - 1)) / n;
    const cy = 150;
    const ch = 400;
    const curIdx = STAGES.indexOf(store.d.stage);
    ui.line(60, cy + ch / 2, ui.w - 60, cy + ch / 2, 'rgba(229,180,81,0.35)', 6);
    STAGES.forEach((lv, i) => {
      const x = 60 + i * (cw + gap);
      const p = levelProgress(lv);
      const done = curIdx > i || store.d.stage === 'done';
      const cur = curIdx === i;
      const sel = this.sel === lv;
      ui.rect(x, cy, cw, ch, 26, cur ? '#2f3b5e' : C.card, sel ? C.accent2 : cur ? C.accent : C.line, sel ? 5 : 2);
      ui.text(STAGE_NAME[lv], x + cw / 2, cy + 80, { size: 72, weight: 700, align: 'center', color: done ? C.ok : cur ? C.ink : C.sub });
      ui.text(`${SEASONS[STAGE_SEASON[lv]].name}`, x + cw / 2, cy + 145, { size: 28, color: C.dim, align: 'center' });
      ui.text('진도', x + 24, cy + 200, { size: 24, color: C.sub });
      ui.bar(x + 24, cy + 220, cw - 48, 16, p.frac, C.accent2);
      ui.text('숙련', x + 24, cy + 262, { size: 24, color: C.sub });
      ui.bar(x + 24, cy + 282, cw - 48, 16, p.mastery, C.ok);
      const ex = store.d.exams[lv];
      const label = done ? '완료' : cur ? '진행 중' : '예정';
      ui.text(ex?.passed ? `合格 ${ex.best}점` : ex ? `최고 ${ex.best}점` : label, x + cw / 2, cy + 350, { size: 30, weight: 700, align: 'center', color: ex?.passed ? C.accent : cur ? C.accent2 : C.dim });
      ui.hit(x, cy, cw, ch, () => { this.sel = lv; this.confirm = null; });
    });
    // detail
    const lv = this.sel;
    const y0 = 590;
    ui.rect(60, y0, ui.w - 120, 630, 26, 'rgba(0,0,0,0.22)', C.line);
    ui.text(`${STAGE_NAME[lv]} 상세`, 110, y0 + 60, { size: 46, weight: 700 });
    const p = levelProgress(lv);
    let y = y0 + 120;
    const rows = lv === 'kana' ? [['가나', p.kana, C.kana]] : [
      ['한자', p.kanji, C.kanji], ['단어', p.vocab, C.vocab], ['문법', p.grammar, C.grammar], ['독해', p.reading, C.reading], ['청해', p.listening, C.listening],
    ];
    for (const [name, v, col] of rows) {
      ui.text(name, 110, y + 18, { size: 32, weight: 600 });
      ui.bar(250, y + 6, 700, 24, v.total ? v.seen / v.total : 0, col);
      ui.text(`${v.seen} / ${v.total}${v.strong !== undefined ? ` · 숙련 ${v.strong}` : ''}`, 980, y + 18, { size: 30, color: C.sub });
      y += 64;
    }
    if (lv !== 'kana') {
      const q = quotas(lv);
      ui.text(`${PACES[store.d.settings.pace].name} 속도 기준 하루: 단어 ${q.vocab} · 한자 ${q.kanji} · 문법 ${q.grammar} · 약 ${q.days}일 과정`, 110, y + 30, { size: 28, color: C.dim });
      ui.text(`JLPT 합격선 ${PASS[lv].total}/180`, 110, y + 76, { size: 28, color: C.dim });
    }
    const bx = 1480;
    let by = y0 + 60;
    ui.button(bx, by, 460, 100, `${STAGE_NAME[lv]} 모의고사`, async () => {
      const m = await import('./exam.js');
      this.app.go(new m.Exam(this.app, lv));
    }, { style: 'primary', size: 38, color: C.indigo });
    by += 120;
    if (store.d.stage !== lv) {
      if (this.confirm === lv) {
        ui.para(`${STAGE_NAME[lv]} 단계로 이동할까요? 앞 단계에서 배우지 않은 항목은 “이미 앎”으로 표시할 수 있어요.`, bx, by, 460, { size: 26, color: C.sub });
        by += 130;
        ui.button(bx, by, 220, 90, '이동만', () => this.move(lv, false), { style: 'gold', size: 30 });
        ui.button(bx + 240, by, 220, 90, '앞은 앎 처리', () => this.move(lv, true), { style: 'ghost', size: 28 });
      } else {
        ui.button(bx, by, 460, 100, '이 단계로 이동', () => { this.confirm = lv; }, { style: 'ghost', size: 36 });
      }
    } else if (allIntroduced(lv)) {
      ui.para('모든 항목을 배웠어요! 모의고사에 합격하면 다음 단계가 열립니다.', bx, by, 460, { size: 28, color: C.accent2 });
    }
  }

  move(lv, markPrev) {
    const idx = STAGES.indexOf(lv);
    if (markPrev) {
      for (let i = 0; i < idx; i++) {
        const s = STAGES[i];
        if (s === 'kana') KANA.all.forEach((k) => store.d.items[k.id] || markKnown(k.id));
        else for (const t of ['kanji', 'vocab', 'grammar']) DB.levels[s][t].forEach((it) => store.d.items[it.id] || markKnown(it.id));
      }
    }
    store.d.stage = lv;
    store.save(true);
    this.confirm = null;
    this.app.applySeason();
    this.app.toast(`${STAGE_NAME[lv]} 단계로 이동했어요`);
  }
}

// ================================================================ settings
export class Settings {
  constructor(app) {
    this.app = app;
    this.resetStep = 0;
  }

  seg(ui, y, label, options, value, set) {
    ui.text(label, 90, y + 33, { size: 32, weight: 600 });
    const x0 = 520;
    const w = Math.min(250, (ui.w - x0 - 80) / options.length - 12);
    options.forEach(([v, name], i) => {
      ui.button(x0 + i * (w + 12), y, w, 66, name, () => {
        set(v);
        store.save();
      }, { style: value === v ? 'gold' : 'ghost', size: 28 });
    });
  }

  draw(ui) {
    ui.header('설정', { back: () => this.app.back() });
    const s = store.d.settings;
    const rows = [
      ['학습 속도', Object.entries(PACES).map(([k, p]) => [k, `${p.name} (${p.desc})`]), s.pace, (v) => { s.pace = v; }],
      ['후리가나', [['on', '켜기'], ['off', '끄기']], s.furigana, (v) => { s.furigana = v; }],
      ['가나 로마자', [[true, '표시'], [false, '숨김']], s.romaji, (v) => { s.romaji = v; }],
      ['자동 발음', [[true, '켜기'], [false, '끄기']], s.autoplay, (v) => { s.autoplay = v; }],
      ['음성 엔진', [['auto', '자동'], ['files', '녹음 파일만'], ['tts', '기기 TTS']], s.voice, (v) => { s.voice = v; }],
      ['말하기 속도', [[1.0, '보통'], [0.8, '느리게']], s.rate, (v) => { s.rate = v; }],
      ['효과음', [[0, '끔'], [0.3, '작게'], [0.6, '보통']], s.sfx, (v) => { s.sfx = v; }],
      ['배경 음악 (고토)', [[0, '끔'], [0.3, '작게'], [0.6, '보통']], s.music, (v) => { s.music = v; }],
      ['배경 계절', [['auto', '자동'], ['spring', '봄'], ['summer', '여름'], ['autumn', '가을'], ['winter', '겨울'], ['night', '밤']], s.season, (v) => { s.season = v; this.app.applySeason(); }],
      ['화면 크기', [[1.6, '작게'], [2.0, '보통'], [2.4, '크게']], s.panelSize, (v) => { s.panelSize = v; this.app.applyPanelSettings(); this.app.fitDesktopCamera(); }],
      ['화면 거리 (VR)', [[1.3, '가깝게'], [1.55, '보통'], [1.9, '멀게']], s.panelDist, (v) => { s.panelDist = v; this.app.recenter(); }],
      ['하루 최대 복습', [[50, '50'], [100, '100'], [150, '150'], [300, '300']], s.reviewCap, (v) => { s.reviewCap = v; }],
    ];
    let y = 132;
    for (const r of rows) {
      this.seg(ui, y, ...r);
      y += 77;
    }
    const snd = this.app.sound;
    ui.text(`음성 상태 — 녹음 파일 ${snd.fileHits}회 재생 / 실패 ${snd.fileMisses}회 · 기기 일본어 TTS: ${snd.ttsAvailable ? '있음' : '없음'} · 저장소: ${store.ok ? '정상' : '사용 불가'}`, 90, y + 30, { size: 26, color: C.dim });
    y += 60;
    const vr = this.app.renderer.xr.isPresenting;
    ui.button(90, y, 380, 84, '진도 백업 저장', () => this.exportData(vr), { style: 'ghost', size: 30 });
    ui.button(490, y, 380, 84, '백업 불러오기', () => this.importData(vr), { style: 'ghost', size: 30 });
    const resetLabel = ['진도 초기화', '정말 초기화할까요?', '되돌릴 수 없어요. 확인'][this.resetStep];
    ui.button(ui.w - 540, y, 450, 84, resetLabel, () => {
      this.resetStep++;
      if (this.resetStep >= 3) {
        store.reset();
        this.resetStep = 0;
        this.app.applySeason();
        this.app.toast('초기화했습니다. 앱을 다시 불러옵니다');
        setTimeout(() => location.reload(), 1200);
      }
    }, { style: this.resetStep ? 'primary' : 'ghost', size: 30 });
  }

  exportData(vr) {
    if (vr) return this.app.toast('VR을 나간 뒤 브라우저 화면에서 사용하세요');
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nihongo-vr-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  importData(vr) {
    if (vr) return this.app.toast('VR을 나간 뒤 브라우저 화면에서 사용하세요');
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      try {
        store.importJSON(await inp.files[0].text());
        this.app.applySeason();
        this.app.toast('백업을 불러왔어요');
      } catch (e) {
        this.app.toast(`불러오기 실패: ${e.message}`);
      }
      this.app.redraw();
    };
    inp.click();
  }
}

// ================================================================ stats
export class Stats {
  constructor(app) {
    this.app = app;
  }

  draw(ui) {
    ui.header('학습 기록', { back: () => this.app.back() });
    const st = store.d.stats;
    const items = Object.values(store.d.items);
    const totalSec = Object.values(st.days).reduce((a, d) => a + (d.sec || 0), 0);
    const cards = [
      ['연속 학습', `${st.streak}일`],
      ['최장 연속', `${st.best}일`],
      ['총 XP', st.xp.toLocaleString()],
      ['학습한 항목', items.length.toLocaleString()],
      ['총 학습 시간', `${Math.floor(totalSec / 3600)}시간 ${Math.round((totalSec % 3600) / 60)}분`],
    ];
    const w = (ui.w - 120 - 4 * 20) / 5;
    cards.forEach(([k, v], i) => {
      const x = 60 + i * (w + 20);
      ui.rect(x, 140, w, 180, 24, C.card, C.line);
      ui.text(v, x + w / 2, 210, { size: 60, weight: 700, align: 'center', maxW: w - 30 });
      ui.text(k, x + w / 2, 285, { size: 28, color: C.sub, align: 'center' });
    });
    // heatmap: last 18 weeks
    const weeks = 18;
    const cell = 40;
    const hx = 60;
    const hy = 380;
    ui.text('학습 달력 (최근 18주)', hx, hy - 20, { size: 30, weight: 700 });
    const now = new Date(Date.now() - 4 * 3600 * 1000);
    const dow = now.getDay();
    for (let wk = 0; wk < weeks; wk++) {
      for (let d = 0; d < 7; d++) {
        const back = (weeks - 1 - wk) * 7 + (dow - d);
        if (back < 0) continue;
        const key = today(Date.now() - back * 86400000);
        const ds = st.days[key];
        const v = ds ? ds.n + ds.r : 0;
        const col = !v ? 'rgba(255,255,255,0.06)' : v < 15 ? 'rgba(95,207,143,0.35)' : v < 50 ? 'rgba(95,207,143,0.6)' : C.ok;
        ui.rect(hx + wk * (cell + 6), hy + 10 + d * (cell + 6), cell, cell, 8, col);
      }
    }
    // SRS distribution
    const bands = [['새싹', 1, 2, '#f28fb0'], ['익숙', 3, 4, '#a58cf2'], ['숙련', 5, 6, '#5fb8e8'], ['마스터', 7, 8, '#e5b451'], ['완전정복', 9, 10, '#5fcf8f']];
    const bx = 960;
    ui.text('기억 단계', bx, hy - 20, { size: 30, weight: 700 });
    const max = Math.max(1, ...bands.map(([, a, b]) => items.filter((r) => r[0] >= a && r[0] <= b).length));
    bands.forEach(([name, a, b, col], i) => {
      const n = items.filter((r) => r[0] >= a && r[0] <= b).length;
      const y = hy + 10 + i * 64;
      ui.text(name, bx, y + 24, { size: 30 });
      ui.bar(bx + 160, y + 10, 700, 28, n / max, col);
      ui.text(n.toLocaleString(), bx + 880, y + 24, { size: 28, color: C.sub });
    });
    // level mastery
    const ly = 760;
    ui.text('단계별 숙련도', 60, ly, { size: 30, weight: 700 });
    STAGES.forEach((lv, i) => {
      const p = levelProgress(lv);
      const x = 60 + (i % 3) * 640;
      const y = ly + 40 + Math.floor(i / 3) * 110;
      ui.text(STAGE_NAME[lv], x, y + 30, { size: 34, weight: 700 });
      ui.bar(x + 110, y + 8, 480, 18, p.frac, C.accent2);
      ui.bar(x + 110, y + 40, 480, 18, p.mastery, C.ok);
    });
    ui.text('노란 막대: 배운 비율 · 초록 막대: 숙련(4일 이상 기억) 비율', 60, ly + 290, { size: 26, color: C.dim });
    // week accuracy
    let ok = 0;
    let ng = 0;
    for (let i = 0; i < 7; i++) {
      const ds = st.days[today(Date.now() - i * 86400000)];
      if (ds) {
        ok += ds.ok;
        ng += ds.ng;
      }
    }
    ui.text(`최근 7일 정답률 ${ok + ng ? Math.round((ok / (ok + ng)) * 100) : 0}% (${ok + ng}문제)`, ui.w - 60, ly + 290, { size: 30, color: C.accent2, align: 'right' });
  }
}

// ================================================================ guide
const GUIDE = [
  ['이 앱으로 N1까지 가는 법', [
    '1. 매일 홈에서 “오늘의 학습 시작”만 누르세요. 복습 → 새 한자 → 새 단어 → 새 문법 → 독해·청해 순서로 자동 진행됩니다.',
    '2. 새 항목은 먼저 설명 카드로 보여 주고, 바로 확인 문제를 냅니다. 틀리면 설명을 다시 보여 주고 맞힐 때까지 반복합니다.',
    '3. 배운 항목은 4시간 → 8시간 → 1일 → 2일 → 4일 → 1주 → 2주 → 1개월 → 2개월 → 6개월 간격으로 다시 나옵니다(간격 반복, SRS). 틀리면 간격이 짧아집니다.',
    '4. 한 단계의 항목을 모두 배우면 그 단계 모의고사가 열립니다. JLPT와 같은 기준으로 합격하면 다음 단계와 새 계절이 열립니다.',
    '5. 복습이 많이 밀린 날은 “복습만 하기”로 밀린 것부터 처리하세요. 새 항목보다 복습이 우선입니다.',
  ]],
  ['JLPT란?', [
    '일본어능력시험(JLPT)은 N5(가장 쉬움)부터 N1(가장 어려움)까지 5단계입니다. 한국에서는 매년 7월과 12월 첫째 일요일 무렵에 시행됩니다. 접수 일정과 장소는 반드시 공식 사이트(jlpt.or.kr)에서 확인하세요.',
    'N5: 기본적인 일본어를 어느 정도 이해 (히라가나·가타카나, 기초 한자, 기본 문장)',
    'N4: 기본적인 일본어를 이해 (일상 회화를 천천히 들으면 이해)',
    'N3: 일상적인 장면의 일본어를 어느 정도 이해 (신문 제목, 쉬운 글)',
    'N2: 일상 + 폭넓은 장면의 일본어를 어느 정도 이해 (신문·잡지 기사, 자연스러운 속도의 대화)',
    'N1: 폭넓은 장면에서 쓰이는 일본어를 이해 (논설, 추상적인 글, 뉴스·강의)',
  ]],
  ['시험 구성과 합격 기준', [
    'N1·N2·N3: 언어지식(문자·어휘·문법) 60점 + 독해 60점 + 청해 60점 = 180점. 합격선 N1 100점, N2 90점, N3 95점. 각 영역 19점 미만이면 총점과 관계없이 불합격입니다.',
    'N4·N5: 언어지식·독해 120점 + 청해 60점 = 180점. 합격선 N4 90점, N5 80점. 기준점은 언어지식·독해 38점, 청해 19점입니다.',
    '문자·어휘: 한자 읽기, 표기, 문맥 규정, 유의 표현, 용법 / 문법: 문법 형식 판단, 문장 만들기(★), 글의 문법 / 청해: 과제 이해, 포인트 이해, 개요 이해, 발화 표현, 즉시 응답, 통합 이해',
    '이 앱의 모의고사도 같은 방식으로 점수를 환산하고 기준점을 적용합니다. 실제 시험은 문항 수와 시간이 더 많으니, 합격 후에도 실전 기출·공식 문제집으로 시간 배분을 연습하세요.',
  ]],
  ['단계별 공부 포인트', [
    '문자: 히라가나 → 가타카나. 모양이 비슷한 글자(さ·ち, ぬ·め, シ·ツ, ソ·ン)를 구분하는 것이 핵심입니다.',
    'N5·N4: 동사 활용(ます·て·ない·た·가능·의지·수동·사역)을 “활용 연습”에서 완전히 자동화하세요. 조사(は·が·を·に·で)와 숫자·조수사도 중요합니다.',
    'N3: 자동사·타동사 쌍, 복합동사, ～ようにする·～ことにする 같은 비슷한 문법의 차이를 예문으로 익히세요.',
    'N2: 문어체 문법(～に際して, ～をめぐって)과 신문·설명문 어휘가 늘어납니다. 독해는 “필자의 주장” 찾기를 연습하세요.',
    'N1: 추상 어휘, 딱딱한 문장체 문법(～をもって, ～んがため), 긴 논설문과 긴 청해. 매일 섀도잉으로 청해 속도에 익숙해지세요.',
  ]],
  ['VR 조작법', [
    '가리키기: 컨트롤러에서 나오는 빛줄기를 버튼에 맞추고 트리거를 당기면 선택됩니다. 손 추적(핸드 트래킹)일 때는 엄지와 검지를 붙였다 떼면 됩니다.',
    'A / X 버튼: 다음, 계속 · B / Y 버튼: 뒤로 · 스틱 좌우: 페이지 넘기기 · 스틱 위아래: 단어장 10페이지씩 이동',
    '스틱 누르기 또는 그립: 학습 화면을 내 앞으로 다시 불러오기. 앉아서도 서서도 쓸 수 있고, 설정에서 화면 크기와 거리를 바꿀 수 있습니다.',
    'PC·폰 브라우저에서는 마우스·터치로, 키보드는 1~4(선택지), Enter/Space(다음), Esc(뒤로), R(다시 듣기), F(후리가나)를 쓸 수 있습니다.',
    '진도는 이 기기의 브라우저에 자동 저장됩니다. 다른 기기로 옮기려면 설정의 “진도 백업 저장/불러오기”를 쓰세요(VR 밖 브라우저 화면에서).',
  ]],
];

export class Guide {
  constructor(app) {
    this.app = app;
    this.page = 0;
  }

  onKey(k) {
    if (k === 'left' || k === 'right') {
      this.page = Math.max(0, Math.min(GUIDE.length - 1, this.page + (k === 'right' ? 1 : -1)));
      return true;
    }
    return false;
  }

  draw(ui) {
    ui.header('JLPT · 사용법', { back: () => this.app.back() });
    GUIDE.forEach(([title], i) => {
      ui.button(60, 150 + i * 110, 480, 96, title, () => { this.page = i; }, { style: i === this.page ? 'gold' : 'ghost', size: 30 });
    });
    const [title, paras] = GUIDE[this.page];
    ui.rect(580, 150, ui.w - 640, 1070, 26, 'rgba(0,0,0,0.22)', C.line);
    ui.text(title, 630, 215, { size: 50, weight: 700, color: C.accent2 });
    let y = 280;
    for (const p of paras) y += ui.para(p, 630, y, ui.w - 740, { size: 33 }) + 22;
  }
}
