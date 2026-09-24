// Shared widgets: question card, teaching card, tabs, pager.
import { C, TYPE_COLOR, TYPE_NAME } from '../ui/theme.js';
import { DB } from '../core/db.js';
import { KANA } from '../core/kana.js';
import { toKata, wordRuby, isKanji } from '../core/furigana.js';
import { rec, stageName } from '../core/srs.js';
import { store } from '../core/store.js';

export const fmtKun = (s) => (s || '').split('、').filter(Boolean).map((r) => r.replace(/^-/, '~').replace(/-$/, '~').replace(/\.(.+)$/, '($1)')).join('・');
export const fmtOn = (s) => (s || '').split('、').filter(Boolean).map(toKata).join('・');

export function typeChip(ui, x, y, type, extra = '') {
  return ui.chip(x, y, TYPE_NAME[type] + (extra ? ` · ${extra}` : ''), TYPE_COLOR[type] || C.accent2);
}

export function tabs(ui, x, y, labels, active, onSelect, o = {}) {
  const w = o.w || 150;
  const h = o.h || 72;
  labels.forEach((l, i) => {
    ui.button(x + i * (w + 12), y, w, h, l, () => onSelect(i), { style: i === active ? 'gold' : 'ghost', size: o.size || 32 });
  });
}

export function pager(ui, x, y, page, pages, onChange) {
  ui.button(x, y, 110, 76, '◀', () => onChange(Math.max(0, page - 1)), { style: 'ghost', disabled: page <= 0, key: 'left', sfx: 'page' });
  ui.text(`${page + 1} / ${Math.max(1, pages)}`, x + 185, y + 38, { size: 32, color: C.sub, align: 'center' });
  ui.button(x + 260, y, 110, 76, '▶', () => onChange(Math.min(pages - 1, page + 1)), { style: 'ghost', disabled: page >= pages - 1, key: 'right', sfx: 'page' });
}

export function srsDot(ui, x, y, id, r = 9) {
  const s = rec(id)?.[0] || 0;
  const col = !s ? 'rgba(255,255,255,0.12)' : s <= 2 ? '#f28fb0' : s <= 4 ? '#a58cf2' : s <= 6 ? '#5fb8e8' : s <= 8 ? '#e5b451' : '#5fcf8f';
  ui.circle(x, y, r, col);
}

// one-line summary of an item (used in feedback & lists)
export function itemLine(it) {
  switch (it.type) {
    case 'kana': return `${it.k}  —  ${it.ko} (${it.ro})`;
    case 'kanji': return `${it.c}  —  ${it.ko}   ${fmtOn(it.on)} / ${fmtKun(it.kun)}`;
    case 'vocab': return `${it.ruby}  —  ${it.ko}`;
    case 'grammar': return `${it.p}  —  ${it.m}`;
  }
  return '';
}

export function speakItem(app, it) {
  if (!it) return;
  if (it.type === 'kana') app.sound.say(it.k === 'ー' ? 'ラーメン' : it.k);
  else if (it.type === 'kanji') {
    const w = (DB.wordsByKanji.get(it.c) || [])[0];
    app.sound.say(w ? w.r : (it.kun || it.on).split('、')[0].replace(/[.\-]/g, ''));
  } else if (it.type === 'vocab') app.sound.say(it.r);
  else if (it.type === 'grammar') app.sound.say(it.ex[0][0]);
}

// ================================================================ quiz card
export class QuizCard {
  constructor(app, q, o = {}) {
    this.app = app;
    this.q = q;
    this.o = o;
    this.chosen = -1;
    this.spoken = false;
  }

  get answered() {
    return this.chosen >= 0;
  }

  play() {
    const p = this.q.prompt;
    if (p.seq) this.app.sound.sequence(p.seq, 450);
    else if (p.audio) this.app.sound.say(p.audio);
  }

  choose(i) {
    if (this.answered) return;
    this.chosen = i;
    const ok = i === this.q.answer;
    this.app.sound.sfx(ok ? 'ok' : 'ng');
    if (ok) this.app.mascot.cheer();
    else this.app.mascot.sad();
    this.app.haptic(null, ok ? 0.3 : 0.7, ok ? 40 : 120);
    this.o.onAnswer?.(ok, this.q);
    // after answering, say the answer so sound and meaning connect
    if (!this.o.exam && store.d.settings.autoplay) {
      const it = this.q.item;
      if (this.q.full) this.app.sound.say(this.q.full);
      else if (this.q.ex) this.app.sound.say(this.q.ex[0]);
      else if (it) speakItem(this.app, it);
    }
    this.app.redraw();
  }

  onKey(k) {
    const m = /^opt(\d)$/.exec(k);
    if (m && !this.answered) {
      const i = Number(m[1]) - 1;
      if (i < this.q.options.length) this.choose(i);
      return true;
    }
    if (k === 'audio') {
      this.play();
      return true;
    }
    return false;
  }

  draw(ui, top = 150, progress = '') {
    const q = this.q;
    const p = q.prompt;
    if (!this.spoken) {
      this.spoken = true;
      if (p.autoplay || (p.audio && store.d.settings.autoplay && (p.listen || q.mode === 'vocab-meaning'))) setTimeout(() => this.play(), 250);
    }
    const X = 60;
    const W = ui.w - 120;
    ui.text(q.instr, X + 4, top + 26, { size: 34, color: C.sub, maxW: W - 420 });
    if (progress) ui.text(progress, X + W, top + 26, { size: 30, color: C.dim, align: 'right' });
    // prompt box
    const py = top + 64;
    const ph = 500;
    ui.rect(X, py, W, ph, 30, 'rgba(0,0,0,0.22)', C.line);
    if (q.item && !this.o.exam) typeChip(ui, X + 24, py + 22, q.type, q.item.level?.toUpperCase?.() === 'KANA' ? '' : q.item.level?.toUpperCase?.());
    const cx = X + W / 2;
    let bottom = py + ph;
    const resultY = py + ph - 108;
    const bigArea = this.answered && !this.o.exam ? ph - 120 : ph;
    if (p.listen && p.sentence) {
      const s = 150;
      ui.speaker(cx - s / 2, py + 40, s, () => this.play(), { fill: C.card2, key: 'audio' });
      ui.rich(p.sentence, X + 80, py + 220, W - 160, { size: 44, align: 'center', maxLines: 2 });
      if (p.ko && this.o.showKo !== false) ui.text(p.ko, cx, py + 380, { size: 30, color: C.dim, align: 'center', maxW: W - 160 });
    } else if (p.listen) {
      const s = 230;
      ui.speaker(cx - s / 2, py + (bigArea - s) / 2, s, () => this.play(), { fill: C.card2, key: 'audio' });
    } else if (p.sentence) {
      const size = p.sentence.length > 40 ? 50 : 58;
      const L = ui.layout(p.sentence, W - 160, { size, blank: p.blank, furigana: p.furigana ?? ui.furigana });
      const koH = p.ko && this.o.showKo !== false ? 60 : 0;
      const y0 = py + Math.max(70, (bigArea - L.h - koH) / 2);
      ui.rich(p.sentence, X + 80, y0, W - 160, { layout: L, align: L.lines.length === 1 ? 'center' : 'left' });
      if (koH) ui.text(p.ko, cx, y0 + L.h + 36, { size: 32, color: C.dim, align: 'center', maxW: W - 160 });
    } else if (p.word) {
      const ruby = p.noRuby ? p.word : q.item?.ruby || p.word;
      const size = p.word.length > 6 ? 120 : 160;
      const L = ui.layout(ruby, W - 200, { size, weight: 500, furigana: !p.noRuby && ui.furigana });
      ui.rich(ruby, X + 100, py + (bigArea - L.h) / 2, W - 200, { layout: L, align: 'center' });
    } else if (p.big !== undefined) {
      const small = p.small;
      const size = small ? (p.big.length > 12 ? 64 : 88) : p.big.length > 3 ? 150 : 280;
      ui.text(p.big, cx, py + bigArea / 2 + (small ? 0 : 12), { size, weight: small ? 600 : 500, align: 'center', maxW: W - 200 });
    }
    if (p.audio && !p.listen) ui.speaker(X + W - 130, py + 26, 96, () => this.play(), { key: 'audio' });

    if (this.answered && !this.o.exam) {
      const ok = this.chosen === q.answer;
      ui.rect(X + 20, resultY, W - 40, 88, 20, ok ? 'rgba(95,207,143,0.16)' : 'rgba(240,104,90,0.16)', ok ? C.ok : C.ng, 2);
      ui.text(ok ? '정답!' : '오답', X + 50, resultY + 44, { size: 38, weight: 700, color: ok ? C.ok : C.ng });
      const detail = q.item ? itemLine(q.item) : q.options[q.answer].label;
      const extra = q.ex ? `   ${q.ex[1]}` : '';
      ui.rich(detail + extra, X + 190, resultY + 16, W - 260, { size: 34, maxLines: 1, furigana: false });
    }
    bottom = py + ph;
    // options
    const oy = bottom + 30;
    const ow = (W - 24) / 2;
    const oh = (ui.h - oy - 40 - 24) / 2;
    q.options.forEach((opt, i) => {
      const x = X + (i % 2) * (ow + 24);
      const y = oy + Math.floor(i / 2) * (oh + 24);
      let state = null;
      if (this.answered) {
        if (i === q.answer && !this.o.exam) state = 'ok';
        else if (i === this.chosen) state = this.o.exam ? 'on' : 'ng';
        else state = 'dim';
      }
      const size = opt.big ? 96 : opt.rich ? 46 : opt.label.length > 18 ? 34 : 42;
      ui.button(x, y, ow, oh, opt.label, () => this.choose(i), {
        size, rich: !!opt.rich, state, key: `opt${i + 1}`, weight: opt.big ? 500 : 600, sfx: 'none', r: 24,
        furigana: opt.rich ? ui.furigana : undefined,
      });
      ui.text(String(i + 1), x + 26, y + 30, { size: 24, color: C.dim, weight: 700 });
    });
  }
}

// ================================================================ teaching card
export function drawTeach(app, ui, it, y0 = 150) {
  const X = 60;
  const W = ui.w - 120;
  const H = ui.h - y0 - 150;
  ui.rect(X, y0, W, H, 30, 'rgba(0,0,0,0.22)', C.line);
  const lvl = it.level && it.level !== 'kana' ? it.level.toUpperCase() : '';
  typeChip(ui, X + 24, y0 + 22, it.type, lvl);
  const s = rec(it.id)?.[0];
  if (s) ui.text(`${stageName(s)} (${s}단계)`, X + W - 30, y0 + 44, { size: 26, color: C.dim, align: 'right' });
  if (it.type === 'kana') return teachKana(app, ui, it, X, y0, W, H);
  if (it.type === 'kanji') return teachKanji(app, ui, it, X, y0, W, H);
  if (it.type === 'vocab') return teachVocab(app, ui, it, X, y0, W, H);
  if (it.type === 'grammar') return teachGrammar(app, ui, it, X, y0, W, H);
}

function exampleWordsForKana(k) {
  const pool = [...DB.levels.n5.vocab, ...DB.levels.n4.vocab];
  if (k.script === 'k') return pool.filter((v) => v.w.includes(k.k)).slice(0, 3);
  const kanaWords = pool.filter((v) => v.w === v.r && v.r.includes(k.k));
  const others = pool.filter((v) => v.w !== v.r && v.r.includes(k.k));
  return [...kanaWords, ...others].slice(0, 3);
}

function teachKana(app, ui, k, X, y0, W, H) {
  const bx = X + 60;
  const by = y0 + 90;
  ui.rect(bx, by, 560, 560, 30, '#f6f0e2');
  ui.text(k.k, bx + 280, by + 300, { size: k.k.length > 1 ? 250 : 380, color: '#1d1b18', align: 'center', weight: 500 });
  ui.speaker(bx + 440, by + 20, 100, () => speakItem(app, k), { fill: '#e8dfca', color: '#1d1b18', key: 'audio' });
  const rx = X + 700;
  ui.text(k.ko, rx, y0 + 170, { size: 110, weight: 700, color: C.kana });
  if (store.d.settings.romaji) ui.text(k.ro, rx + ui.measure(k.ko, 110, 700) + 40, y0 + 180, { size: 70, color: C.sub });
  const g = KANA.groups.find((x) => x.items.some((i) => i.id === k.id));
  let y = y0 + 280;
  if (g?.tip) y += ui.para(g.tip, rx, y, W - 760, { size: 36, color: C.ink }) + 30;
  const ex = exampleWordsForKana(k);
  if (ex.length) {
    ui.text('예시 단어', rx, y + 10, { size: 30, color: C.dim });
    y += 50;
    for (const v of ex) {
      ui.rich(v.ruby, rx, y, 700, { size: 44 });
      ui.text(v.ko, rx + 520, y + 50, { size: 32, color: C.sub, maxW: W - 1280 });
      ui.hit(rx - 10, y - 5, W - 720, 90, () => app.sound.say(v.r));
      y += 96;
    }
  }
}

function teachKanji(app, ui, kj, X, y0, W, H) {
  const bx = X + 60;
  const by = y0 + 90;
  ui.rect(bx, by, 520, 520, 30, '#f6f0e2');
  // grid guide lines like a practice sheet
  ui.line(bx + 260, by + 20, bx + 260, by + 500, 'rgba(200,80,60,0.25)', 2);
  ui.line(bx + 20, by + 260, bx + 500, by + 260, 'rgba(200,80,60,0.25)', 2);
  ui.text(kj.c, bx + 260, by + 280, { size: 400, color: '#1d1b18', align: 'center', weight: 500 });
  ui.text(`${kj.strokes}획`, bx + 20, by + 560, { size: 30, color: C.dim });
  ui.speaker(bx + 400, by + 530, 90, () => speakItem(app, kj), { key: 'audio' });
  const rx = X + 660;
  ui.text(kj.ko, rx, y0 + 150, { size: 80, weight: 700, color: C.kanji, maxW: W - 700 });
  ui.text(kj.en, rx, y0 + 225, { size: 30, color: C.dim, maxW: W - 700 });
  let y = y0 + 270;
  ui.text('음독 音', rx, y + 26, { size: 30, color: C.sub });
  ui.text(fmtOn(kj.on) || '—', rx + 170, y + 26, { size: 46, weight: 500, maxW: W - 900 });
  y += 70;
  ui.text('훈독 訓', rx, y + 26, { size: 30, color: C.sub });
  ui.text(fmtKun(kj.kun) || '—', rx + 170, y + 26, { size: 46, weight: 500, maxW: W - 900 });
  y += 90;
  const words = (DB.wordsByKanji.get(kj.c) || []).slice(0, 5);
  if (words.length) {
    ui.text('이 한자가 쓰인 단어', rx, y, { size: 30, color: C.dim });
    y += 30;
    for (const v of words) {
      ui.rich(v.ruby, rx, y, 560, { size: 42 });
      ui.text(`${v.ko}`, rx + 460, y + 50, { size: 30, color: C.sub, maxW: W - 1180 });
      ui.text(v.level.toUpperCase(), X + W - 40, y + 50, { size: 24, color: C.dim, align: 'right' });
      ui.hit(rx - 10, y, W - 700, 84, () => app.sound.say(v.r));
      y += 84;
    }
  }
}

function teachVocab(app, ui, v, X, y0, W, H) {
  const cx = X + W / 2;
  const size = v.w.length > 7 ? 110 : 150;
  const L = ui.layout(v.ruby, W - 200, { size, weight: 500 });
  ui.rich(v.ruby, X + 100, y0 + 110, W - 200, { layout: L, align: 'center' });
  let y = y0 + 110 + L.h + 20;
  ui.text(v.ko, cx, y + 40, { size: 64, weight: 700, color: C.vocab, align: 'center', maxW: W - 200 });
  y += 100;
  ui.text(`${v.rAll}   ·   ${v.en}`, cx, y + 20, { size: 30, color: C.dim, align: 'center', maxW: W - 200 });
  ui.speaker(X + W - 150, y0 + 110, 110, () => app.sound.say(v.r), { key: 'audio' });
  y += 70;
  const kanji = [...new Set(v.w)].filter(isKanji).map((c) => DB.kanjiByChar.get(c)).filter(Boolean);
  if (kanji.length) {
    const bw = Math.min(360, (W - 200) / kanji.length - 20);
    let x = cx - (kanji.length * (bw + 20) - 20) / 2;
    for (const k of kanji) {
      ui.rect(x, y, bw, 150, 20, C.card, C.line);
      ui.text(k.c, x + 70, y + 78, { size: 80, align: 'center' });
      ui.text(k.ko, x + 130, y + 60, { size: 30, color: C.kanji, weight: 700, maxW: bw - 145 });
      ui.text(fmtOn(k.on).split('・')[0] || fmtKun(k.kun).split('・')[0], x + 130, y + 102, { size: 26, color: C.sub, maxW: bw - 145 });
      x += bw + 20;
    }
  }
}

function teachGrammar(app, ui, g, X, y0, W, H) {
  let y = y0 + 90;
  ui.text(g.p, X + 60, y + 50, { size: 70, weight: 700, color: C.grammar, maxW: W - 120 });
  y += 110;
  ui.text(g.m, X + 60, y + 30, { size: 44, weight: 600, maxW: W - 120 });
  y += 70;
  if (g.f) {
    const fw = Math.min(W - 120, ui.measure(g.f, 34, 500) + 190);
    ui.rect(X + 60, y, fw, 64, 16, 'rgba(165,140,242,0.14)', C.grammar);
    ui.text('접속', X + 90, y + 33, { size: 28, color: C.grammar, weight: 700 });
    ui.text(g.f, X + 180, y + 33, { size: 34, maxW: fw - 140 });
    y += 84;
  }
  if (g.d) y += ui.para(g.d, X + 60, y, W - 120, { size: 32, color: C.sub, maxLines: 3 }) + 12;
  for (const [ja, ko] of g.ex.slice(0, 3)) {
    if (y > y0 + H - 120) break;
    ui.speaker(X + 60, y + 14, 70, () => app.sound.say(ja), { sfx: 'none' });
    const L = ui.layout(ja, W - 260, { size: 42 });
    ui.rich(ja, X + 160, y, W - 260, { layout: L, targetColor: C.accent2 });
    y += L.h;
    ui.text(ko, X + 160, y + 20, { size: 30, color: C.sub, maxW: W - 260 });
    y += 64;
  }
}

export { wordRuby };
