// 독해 (reading passages) and 청해 (listening dialogues with shadowing).
import { C } from '../ui/theme.js';
import { DB, LEVELS } from '../core/db.js';
import { store, touchStreak } from '../core/store.js';
import { QuizCard, tabs } from './common.js';

const LV_LABEL = LEVELS.map((l) => l.toUpperCase());

function markDone(kind, id, score) {
  const prev = store.d.done[kind][id];
  store.d.done[kind][id] = Math.max(prev ?? 0, score);
  if (prev === undefined) store.d.stats.xp += 30;
  touchStreak();
  store.save();
}

function taskQuestions(task, kind) {
  return task.q.map((q) => ({
    item: null,
    mode: kind,
    instr: kind === 'reading' ? '질문에 알맞은 답을 고르세요' : '대화를 듣고 알맞은 답을 고르세요',
    prompt: kind === 'reading' ? { sentence: q.q } : { sentence: q.q, ko: q.qk },
    options: q.o.map((o) => ({ label: o, rich: true })),
    answer: q.a,
    x: q.x,
  }));
}

class TaskList {
  constructor(app, lv, kind) {
    this.app = app;
    this.kind = kind;
    this.lv = LEVELS.includes(lv) ? lv : 'n5';
    this.page = 0;
  }

  onKey(k) {
    const n = Math.ceil(DB.levels[this.lv][this.kind].length / 8);
    if (k === 'left' || k === 'right') {
      this.page = Math.max(0, Math.min(n - 1, this.page + (k === 'right' ? 1 : -1)));
      return true;
    }
    return false;
  }

  draw(ui) {
    const reading = this.kind === 'reading';
    ui.header(reading ? '독해' : '청해', { back: () => this.app.back() });
    tabs(ui, 400, 30, LV_LABEL, LEVELS.indexOf(this.lv), (i) => { this.lv = LEVELS[i]; this.page = 0; }, { w: 130 });
    const list = DB.levels[this.lv][this.kind];
    if (!list.length) {
      ui.para('이 레벨의 자료가 아직 없습니다.', 60, 200, 1800, { size: 36, color: C.sub });
      return;
    }
    const rows = list.slice(this.page * 8, this.page * 8 + 8);
    rows.forEach((t, i) => {
      const y = 150 + i * 132;
      const score = store.d.done[this.kind][t.id];
      ui.rect(60, y, ui.w - 120, 118, 20, C.card, C.line);
      ui.text(`${this.page * 8 + i + 1}`, 110, y + 59, { size: 34, color: C.dim, align: 'center' });
      ui.rich(t.t, 170, y + 22, 1300, { size: 42, maxLines: 1 });
      const sub = reading ? `${t.x.length}문단 · ${t.q.length}문제` : `${t.lines.length}줄 대화 · ${t.q.length}문제`;
      ui.text(sub, 1500, y + 59, { size: 28, color: C.sub });
      if (score !== undefined) ui.chip(ui.w - 290, y + 36, `${Math.round(score * 100)}점`, score >= 0.6 ? C.ok : C.accent);
      ui.hit(60, y, ui.w - 120, 118, () => this.app.go(reading ? new ReadingView(this.app, t) : new ListeningView(this.app, t)));
    });
    const pages = Math.ceil(list.length / 8);
    if (pages > 1) {
      ui.button(ui.w - 430, 30, 110, 76, '◀', () => { this.page = Math.max(0, this.page - 1); }, { style: 'ghost', key: 'left' });
      ui.text(`${this.page + 1}/${pages}`, ui.w - 255, 68, { size: 30, color: C.sub, align: 'center' });
      ui.button(ui.w - 170, 30, 110, 76, '▶', () => { this.page = Math.min(pages - 1, this.page + 1); }, { style: 'ghost', key: 'right' });
    }
  }
}

export class ReadingList extends TaskList {
  constructor(app, lv) {
    super(app, lv, 'reading');
  }
}
export class ListeningList extends TaskList {
  constructor(app, lv) {
    super(app, lv, 'listening');
  }
}

// ---------------------------------------------------------------- reading
export class ReadingView {
  constructor(app, task) {
    this.app = app;
    this.t = task;
    this.phase = 'read';
    this.page = 0;
    this.qs = taskQuestions(task, 'reading');
    this.qi = 0;
    this.ok = 0;
    this.card = null;
    this.results = [];
  }

  pages(ui, lines, size, width, height, furigana) {
    // paginate paragraphs by laid-out height
    const out = [[]];
    let h = 0;
    for (const para of lines) {
      const L = ui.layout(para, width, { size, furigana });
      if (h + L.h > height && out[out.length - 1].length) {
        out.push([]);
        h = 0;
      }
      out[out.length - 1].push(L);
      h += L.h + size * 0.6;
    }
    return out;
  }

  exit() {
    this.app.sound.stop();
  }

  onKey(k) {
    if (this.phase === 'q' && this.card) {
      if (this.card.onKey(k)) return true;
      if (k === 'next' && this.card.answered) {
        this.nextQ();
        return true;
      }
      return k === 'next';
    }
    if ((this.phase === 'read' || this.phase === 'trans') && (k === 'left' || k === 'right')) {
      this.page = Math.max(0, this.page + (k === 'right' ? 1 : -1));
      return true;
    }
    return false;
  }

  nextQ() {
    this.qi++;
    this.card = null;
    if (this.qi >= this.qs.length) {
      this.phase = 'result';
      markDone('reading', this.t.id, this.ok / this.qs.length);
      if (this.ok === this.qs.length) this.app.burst();
    }
  }

  readAloud() {
    this.app.sound.sequence(this.t.x.map((p) => ['F', p]), 300);
  }

  draw(ui) {
    ui.header(this.phase === 'trans' ? '번역' : '독해', { back: () => this.app.back() });
    ui.rich(this.t.t, 420, 40, 900, { size: 40, maxLines: 1, color: C.reading });
    if (this.phase === 'read' || this.phase === 'trans') {
      const trans = this.phase === 'trans';
      const size = trans ? 38 : 44;
      const P = this.pages(ui, trans ? this.t.k : this.t.x, size, ui.w - 240, 900, !trans && ui.furigana);
      this.page = Math.min(this.page, P.length - 1);
      ui.rect(60, 140, ui.w - 120, 960, 26, trans ? C.bg2 : '#f6f0e2');
      let y = 180;
      for (const L of P[this.page]) {
        ui.rich('', 120, y, ui.w - 240, { layout: L, color: trans ? C.ink : '#1d1b18', rubyColor: trans ? C.sub : '#6d6558' });
        y += L.h + size * 0.6;
      }
      const by = ui.h - 150;
      if (P.length > 1) {
        ui.button(60, by, 120, 100, '◀', () => { this.page--; }, { style: 'ghost', key: 'left', disabled: this.page <= 0 });
        ui.text(`${this.page + 1}/${P.length}`, 250, by + 50, { size: 32, color: C.sub, align: 'center' });
        ui.button(320, by, 120, 100, '▶', () => { this.page++; }, { style: 'ghost', key: 'right', disabled: this.page >= P.length - 1 });
      }
      if (!trans) {
        ui.button(480, by, 300, 100, ui.furigana ? '후리가나 끄기' : '후리가나 켜기', () => {
          store.d.settings.furigana = ui.furigana ? 'off' : 'on';
          store.save();
        }, { style: 'ghost', size: 30, key: 'furigana' });
        ui.button(800, by, 300, 100, '소리 내어 읽기', () => this.readAloud(), { style: 'ghost', size: 30, key: 'audio' });
        ui.button(ui.w - 560, by, 500, 100, this.results.length ? '결과 보기 ▶' : '문제 풀기 ▶', () => {
          this.app.sound.stop();
          this.phase = this.results.length ? 'result' : 'q';
        }, { style: 'primary', size: 40, key: 'next' });
      } else {
        ui.button(ui.w - 560, by, 500, 100, '돌아가기', () => { this.phase = 'result'; this.page = 0; }, { style: 'primary', size: 40, key: 'next' });
      }
      return;
    }
    if (this.phase === 'q') {
      const q = this.qs[this.qi];
      if (!this.card || this.card.q !== q) {
        this.card = new QuizCard(this.app, q, {
          onAnswer: (ok) => {
            if (ok) this.ok++;
            this.results[this.qi] = ok;
          },
        });
      }
      this.card.draw(ui, 140, `${this.qi + 1} / ${this.qs.length}`);
      if (this.card.answered) {
        ui.button(ui.w - 330, 26, 270, 84, '다음 ▶', () => this.nextQ(), { style: 'primary', size: 38, key: 'next' });
        if (q.x) {
          ui.rect(60, 596, ui.w - 120, 92, 18, 'rgba(10,12,20,0.85)', C.reading);
          ui.rich(`해설: ${q.x}`, 90, 610, ui.w - 180, { size: 30, maxLines: 2, furigana: false });
        }
      } else {
        ui.button(ui.w - 400, 26, 340, 84, '지문 다시 보기', () => { this.phase = 'read'; this.page = 0; }, { style: 'ghost', size: 32 });
      }
      return;
    }
    // result
    const cx = ui.w / 2;
    ui.text(`${this.ok} / ${this.qs.length}`, cx, 330, { size: 150, weight: 700, align: 'center', color: this.ok === this.qs.length ? C.ok : C.accent2 });
    let y = 460;
    this.qs.forEach((q, i) => {
      ui.text(this.results[i] ? '○' : '×', 120, y + 30, { size: 44, weight: 700, color: this.results[i] ? C.ok : C.ng });
      ui.rich(`${q.prompt.sentence}  →  ${q.options[q.answer].label}`, 180, y, ui.w - 260, { size: 32, maxLines: 1, furigana: false });
      if (q.x) ui.para(q.x, 180, y + 48, ui.w - 260, { size: 28, color: C.sub, maxLines: 2 });
      y += 150;
    });
    const by = ui.h - 150;
    ui.button(60, by, 380, 100, '지문 다시 보기', () => { this.phase = 'read'; this.page = 0; }, { style: 'ghost', size: 34 });
    ui.button(470, by, 380, 100, '한국어 번역', () => { this.phase = 'trans'; this.page = 0; }, { style: 'ghost', size: 34 });
    ui.button(ui.w - 560, by, 500, 100, '완료 ▶', () => this.app.back(), { style: 'primary', size: 40, key: 'next' });
  }
}

// ---------------------------------------------------------------- listening
const VOICE = { M: 'M', F: 'F', N: 'F' };

export class ListeningView {
  constructor(app, task) {
    this.app = app;
    this.t = task;
    this.phase = 'listen';
    this.qs = taskQuestions(task, 'listening');
    this.qi = 0;
    this.ok = 0;
    this.results = [];
    this.card = null;
    this.playing = -1;
    this.plays = 0;
    this.showScript = false;
    this.shadow = false;
  }

  exit() {
    this.app.sound.stop();
  }

  pause() {
    this.app.sound.stop();
  }

  lines() {
    const out = [];
    if (this.t.s) out.push(['N', this.t.s[0]]);
    for (const [spk, ja] of this.t.lines) out.push([VOICE[spk] || 'F', ja]);
    return out;
  }

  async play() {
    this.plays++;
    const q = this.qs[Math.min(this.qi, this.qs.length - 1)];
    const seq = [...this.lines()];
    if (this.phase !== 'script') seq.push(['F', q.prompt.sentence]);
    const offset = this.t.s ? 1 : 0;
    await this.app.sound.sequence(seq.map(([v, s]) => [VOICE[v] || v, s]), 500, (i) => {
      this.playing = i - offset;
      this.app.redraw();
    });
    this.playing = -1;
    this.app.redraw();
  }

  async shadowing() {
    // play each line, then leave a gap long enough to repeat it
    this.shadow = true;
    this.app.sound.stop();
    const token = this.app.sound.seqToken;
    for (let i = 0; i < this.t.lines.length; i++) {
      if (token !== this.app.sound.seqToken || !this.shadow) break;
      this.playing = i;
      this.app.redraw();
      const [spk, ja] = this.t.lines[i];
      const t0 = performance.now();
      await this.app.sound.say(ja, VOICE[spk] || 'F', { interrupt: false });
      const dur = performance.now() - t0;
      if (token !== this.app.sound.seqToken) break;
      this.playing = -2 - i; // "your turn"
      this.app.redraw();
      await new Promise((r) => setTimeout(r, Math.max(1200, dur * 1.15)));
    }
    this.shadow = false;
    this.playing = -1;
    this.app.redraw();
  }

  onKey(k) {
    if (this.phase === 'q' && this.card) {
      if (this.card.onKey(k)) return true;
      if (k === 'next' && this.card.answered) {
        this.nextQ();
        return true;
      }
    }
    if (k === 'audio') {
      this.play();
      return true;
    }
    return false;
  }

  nextQ() {
    this.qi++;
    this.card = null;
    if (this.qi >= this.qs.length) {
      this.phase = 'script';
      markDone('listening', this.t.id, this.ok / this.qs.length);
      if (this.ok === this.qs.length) this.app.burst();
    } else {
      this.phase = 'listen';
    }
  }

  draw(ui) {
    ui.header('청해', { back: () => this.app.back() });
    ui.rich(this.t.t, 330, 40, 1000, { size: 40, maxLines: 1, color: C.listening });
    if (this.phase === 'listen') {
      const cx = ui.w / 2;
      const q = this.qs[this.qi];
      ui.speaker(cx - 170, 220, 340, () => this.play(), { fill: this.playing >= 0 ? C.listening : C.card2, key: 'audio' });
      ui.text(this.playing >= 0 ? `재생 중… (${this.playing + 1}/${this.t.lines.length})` : this.plays ? '다시 들으려면 스피커를 누르세요' : '스피커를 눌러 대화를 들으세요', cx, 620, { size: 38, color: C.sub, align: 'center' });
      if (this.t.s) ui.rich(`상황: ${this.t.s[1]}`, 200, 690, ui.w - 400, { size: 34, align: 'center', color: C.dim, furigana: false });
      ui.rich(`質問: ${q.prompt.sentence}`, 200, 770, ui.w - 400, { size: 40, align: 'center' });
      if (q.prompt.ko) ui.text(q.prompt.ko, cx, 880, { size: 30, color: C.dim, align: 'center', maxW: ui.w - 400 });
      ui.button(cx - 250, 1060, 500, 120, '선택지 보기 ▶', () => {
        this.phase = 'q';
      }, { style: 'primary', size: 42, key: 'next', disabled: !this.plays });
      return;
    }
    if (this.phase === 'q') {
      const q = this.qs[this.qi];
      if (!this.card || this.card.q !== q) {
        this.card = new QuizCard(this.app, q, {
          onAnswer: (ok) => {
            if (ok) this.ok++;
            this.results[this.qi] = ok;
          },
        });
      }
      this.card.draw(ui, 140, `${this.qi + 1} / ${this.qs.length}`);
      ui.speaker(ui.w - 200, 214, 110, () => this.play(), { key: 'audio' });
      if (this.card.answered) {
        ui.button(ui.w - 330, 26, 270, 84, '다음 ▶', () => this.nextQ(), { style: 'primary', size: 38, key: 'next' });
        if (q.x) {
          ui.rect(60, 596, ui.w - 120, 92, 18, 'rgba(10,12,20,0.85)', C.listening);
          ui.rich(`해설: ${q.x}`, 90, 610, ui.w - 180, { size: 30, maxLines: 2, furigana: false });
        }
      }
      return;
    }
    // script + translation + shadowing
    ui.text(`결과 ${this.ok} / ${this.qs.length}`, ui.w - 60, 68, { size: 36, weight: 700, align: 'right', color: this.ok === this.qs.length ? C.ok : C.accent2 });
    let y = 140;
    const n = this.t.lines.length;
    const avail = ui.h - 300;
    const rowH = Math.min(150, avail / n);
    const size = rowH < 110 ? 32 : 38;
    this.t.lines.forEach(([spk, ja, ko], i) => {
      const active = this.playing === i;
      const yourTurn = this.playing === -2 - i;
      ui.rect(60, y, ui.w - 120, rowH - 8, 16, active ? 'rgba(243,154,91,0.22)' : yourTurn ? 'rgba(95,207,143,0.18)' : C.card, active ? C.listening : yourTurn ? C.ok : null);
      ui.text(spk === 'M' ? '男' : spk === 'F' ? '女' : '', 100, y + rowH / 2 - 4, { size: 34, weight: 700, color: spk === 'M' ? C.indigo : C.kana, align: 'center' });
      ui.rich(ja, 150, y + 6, ui.w - 420, { size, maxLines: 1 });
      ui.text(yourTurn ? '따라 말해 보세요!' : ko, 150, y + rowH - 30, { size: 26, color: yourTurn ? C.ok : C.sub, maxW: ui.w - 420 });
      ui.speaker(ui.w - 180, y + (rowH - 8) / 2 - 40, 80, () => this.app.sound.say(ja, VOICE[spk] || 'F'));
      y += rowH;
    });
    const by = ui.h - 140;
    ui.button(60, by, 380, 100, '전체 다시 듣기', () => { this.phase = 'script'; this.play(); }, { style: 'ghost', size: 34 });
    ui.button(470, by, 380, 100, this.shadow ? '섀도잉 중지' : '섀도잉 연습', () => {
      if (this.shadow) {
        this.shadow = false;
        this.app.sound.stop();
      } else this.shadowing();
    }, { style: 'ghost', size: 34 });
    ui.button(ui.w - 560, by, 500, 100, '완료 ▶', () => this.app.back(), { style: 'primary', size: 40, key: 'next' });
  }
}
