// Dictionaries: kana chart, kanji / vocabulary / grammar lists, item detail,
// and a small generic quiz runner.
import { C } from '../ui/theme.js';
import { DB, LEVELS } from '../core/db.js';
import { KANA_BY_ID } from '../core/kana.js';
import { toKata, toHira } from '../core/furigana.js';
import { isKnown, learn, markKnown, grade } from '../core/srs.js';
import { store } from '../core/store.js';
import { makeQuestion, shuffle } from '../core/quiz.js';
import { tabs, pager, srsDot, drawTeach, speakItem, QuizCard } from './common.js';

const LV_LABEL = LEVELS.map((l) => l.toUpperCase());

export class CharMenu {
  constructor(app) {
    this.app = app;
  }

  draw(ui) {
    ui.header('가나 · 한자', { back: () => this.app.back() });
    const items = [
      ['あ', '히라가나 표', '46자 + 탁음·요음', C.kana, () => this.app.go(new KanaChart(this.app, 'h'))],
      ['ア', '가타카나 표', '46자 + 외래어 표기', C.kana, () => this.app.go(new KanaChart(this.app, 'k'))],
      ...LEVELS.map((l) => ['字', `${l.toUpperCase()} 한자`, `${DB.levels[l].kanji.length}자`, C.kanji, () => this.app.go(new KanjiList(this.app, l))]),
    ];
    items.forEach(([icon, title, sub, color, fn], i) => {
      const x = 60 + (i % 2) * 974;
      const y = 170 + Math.floor(i / 2) * 250;
      ui.tile(x, y, 954, 220, { icon, title, sub, color }, fn);
    });
  }
}

// ---------------------------------------------------------------- kana chart
const PAGES = [
  { name: '기본 (清音)', cols: ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や・ゆ・よ', 'らりるれろ', 'わ・・・を', 'ん・・・・'] },
  { name: '탁음·반탁음', cols: ['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ'] },
  { name: '요음 (拗音)', rows: ['きゃ きゅ きょ', 'しゃ しゅ しょ', 'ちゃ ちゅ ちょ', 'にゃ にゅ にょ', 'ひゃ ひゅ ひょ', 'みゃ みゅ みょ', 'りゃ りゅ りょ', 'ぎゃ ぎゅ ぎょ', 'じゃ じゅ じょ', 'びゃ びゅ びょ', 'ぴゃ ぴゅ ぴょ'] },
];

export class KanaChart {
  constructor(app, script) {
    this.app = app;
    this.script = script;
    this.page = 0;
    this.sel = null;
  }

  get pages() {
    return this.script === 'k' ? [...PAGES, { name: '외래어 표기', extra: true }] : PAGES;
  }

  cell(ch) {
    if (!ch || ch === '・') return null;
    const k = this.script === 'k' ? toKata(ch) : ch;
    return KANA_BY_ID.get(`${this.script}:${k}`) || null;
  }

  onKey(k) {
    if (k === 'left' || k === 'right') {
      this.page = Math.max(0, Math.min(this.pages.length - 1, this.page + (k === 'right' ? 1 : -1)));
      return true;
    }
    return false;
  }

  draw(ui) {
    ui.header(this.script === 'h' ? '히라가나 표' : '가타카나 표', { back: () => this.app.back() });
    tabs(ui, 700, 30, this.pages.map((p) => p.name), this.page, (i) => { this.page = i; }, { w: 260, size: 28 });
    const P = this.pages[this.page];
    const gx = 60;
    const gy = 150;
    const gw = 1340;
    const gh = 1080;
    let grid = [];
    if (P.cols) {
      const nc = P.cols.length;
      const cw = Math.min(170, gw / nc);
      const ch = gh / 5;
      P.cols.forEach((col, ci) => [...col].forEach((c, ri) => grid.push({ it: this.cell(c), x: gx + ci * cw, y: gy + ri * ch, w: cw - 10, h: ch - 10 })));
    } else if (P.rows) {
      const cw = gw / 3;
      const ch = gh / P.rows.length;
      P.rows.forEach((row, ri) => row.split(' ').forEach((c, ci) => grid.push({ it: this.cell(c), x: gx + ci * cw, y: gy + ri * ch, w: cw - 10, h: ch - 8 })));
    } else {
      const extra = [...KANA_BY_ID.values()].filter((k) => k.group === 'kx');
      const cw = gw / 4;
      const ch = gh / 5;
      extra.forEach((it, i) => grid.push({ it, x: gx + (i % 4) * cw, y: gy + Math.floor(i / 4) * ch, w: cw - 10, h: ch - 10 }));
    }
    for (const g of grid) {
      if (!g.it) continue;
      const sel = this.sel === g.it;
      ui.rect(g.x, g.y, g.w, g.h, 16, sel ? 'rgba(242,143,176,0.2)' : C.card, sel ? C.kana : C.line);
      const size = Math.min(g.h * 0.5, g.it.k.length > 1 ? 58 : 76);
      ui.text(g.it.k, g.x + g.w / 2, g.y + g.h * 0.42, { size, align: 'center', weight: 500 });
      ui.text(`${g.it.ko} ${store.d.settings.romaji ? g.it.ro : ''}`, g.x + g.w / 2, g.y + g.h * 0.8, { size: Math.min(26, g.h * 0.2), color: C.sub, align: 'center', maxW: g.w - 10 });
      srsDot(ui, g.x + 18, g.y + 18, g.it.id, 7);
      ui.hit(g.x, g.y, g.w, g.h, () => {
        this.sel = g.it;
        speakItem(this.app, g.it);
      }, { sfx: 'none' });
    }
    // detail
    const dx = 1440;
    ui.rect(dx, 150, ui.w - dx - 60, 1070, 26, 'rgba(0,0,0,0.22)', C.line);
    const it = this.sel;
    if (!it) {
      ui.para('글자를 누르면 소리를 들을 수 있어요. 점 색은 기억 단계(분홍=새싹 → 초록=완전정복)입니다.', dx + 40, 200, ui.w - dx - 140, { size: 32, color: C.sub });
      return;
    }
    const cx = dx + (ui.w - dx - 60) / 2;
    ui.rect(cx - 200, 200, 400, 400, 26, '#f6f0e2');
    ui.text(it.k, cx, 415, { size: it.k.length > 1 ? 200 : 300, color: '#1d1b18', align: 'center', weight: 500 });
    ui.text(`${it.ko}  ${it.ro}`, cx, 680, { size: 60, weight: 700, color: C.kana, align: 'center' });
    ui.speaker(cx - 60, 740, 120, () => speakItem(this.app, it), { key: 'audio' });
    const other = KANA_BY_ID.get(`${it.script === 'h' ? 'k' : 'h'}:${it.script === 'h' ? toKata(it.k) : toHira(it.k)}`);
    if (other) ui.text(`${it.script === 'h' ? '가타카나' : '히라가나'}: ${other.k}`, cx, 930, { size: 40, color: C.sub, align: 'center' });
  }
}

// ---------------------------------------------------------------- kanji list
export class KanjiList {
  constructor(app, lv = 'n5') {
    this.app = app;
    this.lv = lv;
    this.page = 0;
  }

  onKey(k) {
    const pages = Math.ceil(DB.levels[this.lv].kanji.length / 48);
    if (k === 'left' || k === 'right') {
      this.page = Math.max(0, Math.min(pages - 1, this.page + (k === 'right' ? 1 : -1)));
      return true;
    }
    return false;
  }

  draw(ui) {
    ui.header('한자', { back: () => this.app.back() });
    tabs(ui, 500, 30, LV_LABEL, LEVELS.indexOf(this.lv), (i) => { this.lv = LEVELS[i]; this.page = 0; }, { w: 130 });
    const list = DB.levels[this.lv].kanji;
    const pages = Math.ceil(list.length / 48);
    pager(ui, ui.w - 430, 30, this.page, pages, (p) => { this.page = p; });
    const cols = 12;
    const cw = (ui.w - 120) / cols;
    const ch = 262;
    list.slice(this.page * 48, this.page * 48 + 48).forEach((k, i) => {
      const x = 60 + (i % cols) * cw;
      const y = 150 + Math.floor(i / cols) * (ch + 12);
      ui.rect(x + 4, y, cw - 8, ch, 16, C.card, C.line);
      ui.text(k.c, x + cw / 2, y + 100, { size: 110, align: 'center', weight: 500 });
      ui.text(k.ko.split(' / ')[0], x + cw / 2, y + 205, { size: 26, color: C.kanji, align: 'center', maxW: cw - 24 });
      srsDot(ui, x + 24, y + 22, k.id, 8);
      ui.hit(x + 4, y, cw - 8, ch, () => this.app.go(new ItemDetail(this.app, k, list)));
    });
  }
}

// ---------------------------------------------------------------- vocab list
export class VocabList {
  constructor(app, lv = 'n5') {
    this.app = app;
    this.lv = LEVELS.includes(lv) ? lv : 'n5';
    this.page = 0;
    this.per = 9;
  }

  onKey(k) {
    const pages = Math.ceil(DB.levels[this.lv].vocab.length / this.per);
    if (k === 'left' || k === 'right') {
      this.page = Math.max(0, Math.min(pages - 1, this.page + (k === 'right' ? 1 : -1)));
      return true;
    }
    if (k === 'up' || k === 'down') {
      this.page = Math.max(0, Math.min(pages - 1, this.page + (k === 'down' ? 10 : -10)));
      return true;
    }
    return false;
  }

  draw(ui) {
    ui.header('단어장', { back: () => this.app.back() });
    tabs(ui, 440, 30, LV_LABEL, LEVELS.indexOf(this.lv), (i) => { this.lv = LEVELS[i]; this.page = 0; }, { w: 130 });
    const list = DB.levels[this.lv].vocab;
    const pages = Math.ceil(list.length / this.per);
    pager(ui, ui.w - 430, 30, this.page, pages, (p) => { this.page = p; });
    const rows = list.slice(this.page * this.per, this.page * this.per + this.per);
    const rh = 116;
    rows.forEach((v, i) => {
      const y = 150 + i * (rh + 4);
      ui.rect(60, y, ui.w - 120, rh, 18, i % 2 ? C.card : C.bg2, null);
      srsDot(ui, 100, y + rh / 2, v.id, 10);
      ui.rich(v.ruby, 140, y + 8, 640, { size: 48, maxLines: 1 });
      ui.text(v.ko, 800, y + rh / 2, { size: 38, maxW: ui.w - 1080 });
      ui.hit(60, y, ui.w - 260, rh, () => this.app.go(new ItemDetail(this.app, v, list)));
      ui.speaker(ui.w - 170, y + 14, 88, () => this.app.sound.say(v.r));
    });
    ui.text(`빈도순 정렬 · ${this.page * this.per + 1}–${Math.min(list.length, (this.page + 1) * this.per)} / ${list.length} · 스틱 위아래: 10페이지씩`, 60, ui.h - 40, { size: 26, color: C.dim });
  }
}

// ---------------------------------------------------------------- grammar list
export class GrammarList {
  constructor(app, lv = 'n5') {
    this.app = app;
    this.lv = LEVELS.includes(lv) ? lv : 'n5';
    this.page = 0;
    this.per = 8;
  }

  onKey(k) {
    const pages = Math.ceil(DB.levels[this.lv].grammar.length / this.per);
    if (k === 'left' || k === 'right') {
      this.page = Math.max(0, Math.min(pages - 1, this.page + (k === 'right' ? 1 : -1)));
      return true;
    }
    return false;
  }

  draw(ui) {
    ui.header('문법 사전', { back: () => this.app.back() });
    tabs(ui, 480, 30, LV_LABEL, LEVELS.indexOf(this.lv), (i) => { this.lv = LEVELS[i]; this.page = 0; }, { w: 130 });
    const list = DB.levels[this.lv].grammar;
    const pages = Math.max(1, Math.ceil(list.length / this.per));
    pager(ui, ui.w - 430, 30, this.page, pages, (p) => { this.page = p; });
    if (!list.length) {
      ui.para('이 레벨의 문법 데이터가 없습니다.', 60, 200, 1800, { size: 36, color: C.sub });
      return;
    }
    const rh = 124;
    list.slice(this.page * this.per, this.page * this.per + this.per).forEach((g, i) => {
      const y = 150 + i * (rh + 8);
      ui.rect(60, y, ui.w - 120, rh, 18, C.card, C.line);
      srsDot(ui, 100, y + rh / 2, g.id, 10);
      ui.text(`${this.page * this.per + i + 1}`, 150, y + rh / 2, { size: 26, color: C.dim });
      ui.text(g.p, 220, y + 44, { size: 44, weight: 700, color: C.grammar, maxW: 900 });
      ui.text(g.m, 220, y + 94, { size: 30, color: C.sub, maxW: ui.w - 400 });
      ui.hit(60, y, ui.w - 120, rh, () => this.app.go(new ItemDetail(this.app, g, list)));
    });
  }
}

// ---------------------------------------------------------------- item detail
export class ItemDetail {
  constructor(app, item, list) {
    this.app = app;
    this.item = item;
    this.list = list;
    this.exPage = 0;
    setTimeout(() => speakItem(app, item), 200);
  }

  move(d) {
    if (!this.list) return;
    const i = this.list.indexOf(this.item);
    const j = Math.max(0, Math.min(this.list.length - 1, i + d));
    if (j !== i) {
      this.item = this.list[j];
      this.exPage = 0;
      speakItem(this.app, this.item);
    }
  }

  onKey(k) {
    if (k === 'left' || k === 'right') {
      this.move(k === 'right' ? 1 : -1);
      return true;
    }
    return false;
  }

  draw(ui) {
    const it = this.item;
    ui.header({ kana: '가나', kanji: '한자', vocab: '단어', grammar: '문법' }[it.type], { back: () => this.app.back() });
    if (this.list) {
      const i = this.list.indexOf(it);
      ui.button(ui.w - 560, 30, 110, 76, '◀', () => this.move(-1), { style: 'ghost', key: 'left', disabled: i <= 0 });
      ui.text(`${i + 1} / ${this.list.length}`, ui.w - 380, 68, { size: 30, color: C.sub, align: 'center' });
      ui.button(ui.w - 310, 30, 110, 76, '▶', () => this.move(1), { style: 'ghost', key: 'right', disabled: i >= this.list.length - 1 });
    }
    if (it.type === 'grammar' && it.ex.length > 3) {
      const g = { ...it, ex: it.ex.slice(this.exPage * 3, this.exPage * 3 + 3) };
      drawTeach(this.app, ui, g, 150);
      ui.button(60, ui.h - 130, 380, 100, `예문 더 보기 (${this.exPage + 1}/${Math.ceil(it.ex.length / 3)})`, () => {
        this.exPage = (this.exPage + 1) % Math.ceil(it.ex.length / 3);
      }, { style: 'ghost', size: 30 });
    } else drawTeach(this.app, ui, it, 150);
    const y = ui.h - 130;
    if (!isKnown(it.id)) {
      ui.button(ui.w - 1180, y, 360, 100, '이미 알아요', () => {
        markKnown(it.id);
        store.save();
        this.app.toast('아는 항목으로 표시했어요');
      }, { style: 'ghost', size: 34 });
      ui.button(ui.w - 800, y, 360, 100, '학습 목록에 추가', () => {
        learn(it.id);
        store.save();
        this.app.toast('복습 목록에 추가했어요 (4시간 뒤 첫 복습)');
      }, { style: 'ghost', size: 34 });
    }
    if (it.type !== 'kana') {
      ui.button(ui.w - 420, y, 360, 100, '연습 문제 ▶', () => this.app.go(new QuizRun(this.app, [it, it, it], { title: '연습 문제', grade: false })), { style: 'primary', size: 36, key: 'next' });
    }
  }
}

// ---------------------------------------------------------------- generic quiz run
export class QuizRun {
  // items: list of items (questions generated per item) or ready question objects via o.questions
  constructor(app, items, o = {}) {
    this.app = app;
    this.o = o;
    this.qs = o.questions || shuffle(items).map((it) => makeQuestion(it)).filter(Boolean);
    this.i = 0;
    this.ok = 0;
    this.card = null;
  }

  onKey(k) {
    if (this.i >= this.qs.length) return false;
    if (this.card?.onKey(k)) return true;
    if (k === 'next' && this.card?.answered) {
      this.i++;
      this.card = null;
      return true;
    }
    return false;
  }

  draw(ui) {
    ui.header(this.o.title || '연습', { back: () => this.app.back() });
    if (this.i >= this.qs.length) {
      const cx = ui.w / 2;
      const pct = Math.round((this.ok / Math.max(1, this.qs.length)) * 100);
      ui.text(`${this.ok} / ${this.qs.length}`, cx, 480, { size: 160, weight: 700, align: 'center', color: pct >= 80 ? C.ok : C.accent2 });
      ui.text(pct >= 80 ? '훌륭해요!' : pct >= 50 ? '조금만 더!' : '다시 한 번 해 봐요', cx, 640, { size: 50, align: 'center' });
      ui.button(cx - 560, 900, 500, 120, '돌아가기', () => this.app.back(), { style: 'ghost', size: 40 });
      ui.button(cx + 60, 900, 500, 120, '다시 풀기 ▶', () => {
        this.qs = this.o.regen ? this.o.regen() : this.qs.map((q) => (q.item ? makeQuestion(q.item) : q));
        this.i = 0;
        this.ok = 0;
        this.card = null;
      }, { style: 'primary', size: 42, key: 'next' });
      return;
    }
    const q = this.qs[this.i];
    if (!this.card || this.card.q !== q) {
      this.card = new QuizCard(this.app, q, {
        onAnswer: (ok) => {
          if (ok) this.ok++;
          if (this.o.grade && q.item) {
            grade(q.item.id, ok);
            store.save();
          }
        },
        showKo: this.o.showKo,
      });
    }
    this.card.draw(ui, 140, `${this.i + 1} / ${this.qs.length}`);
    if (this.card.answered) ui.button(ui.w - 330, 26, 270, 84, '다음 ▶', () => { this.i++; this.card = null; }, { style: 'primary', size: 38, key: 'next' });
  }
}
