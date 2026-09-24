// Immediate-mode 2D UI drawn onto a panel canvas. Each redraw rebuilds the
// list of hit regions; hover highlights are separate 3D quads (see panel.js)
// so pointing around never forces a canvas re-upload.
import { C, font } from './theme.js';
import { parseRuby } from '../core/furigana.js';

const NO_START = '、。，．・：；？！ー」』）］｝〕〉》】ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ…,.!?)]}%〜';
const NO_END = '「『（［｛〔〈《【(';
const ATOM = /\n|[ \t　]+|[A-Za-z0-9À-ɏ가-힣㄰-㆏'’\-_.,:;!?%/&+=#@*~^()"<>·…→←↑↓~]+|./gsu;

export class UI {
  constructor(panel) {
    this.panel = panel;
    this.ctx = panel.ctx;
    this.w = panel.w;
    this.h = panel.h;
    this.hits = [];
    this.furigana = true;
    this.measureCache = new Map();
  }

  begin(bg = true) {
    const { ctx } = this;
    this.hits = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (bg) {
      this.rect(0, 0, this.w, this.h, 44, C.bg);
      ctx.save();
      ctx.globalAlpha = 0.5;
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, 'rgba(79,124,196,0.22)');
      g.addColorStop(1, 'rgba(239,91,63,0.06)');
      this.rect(0, 0, this.w, this.h, 44, g);
      ctx.restore();
      this.rect(2, 2, this.w - 4, this.h - 4, 42, null, 'rgba(229,180,81,0.35)', 3);
    }
  }

  // ------------------------------------------------------------ primitives
  path(x, y, w, h, r) {
    const { ctx } = this;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  rect(x, y, w, h, r = 0, fill = null, stroke = null, lw = 2) {
    const { ctx } = this;
    this.path(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  circle(x, y, r, fill, stroke = null, lw = 2) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  line(x1, y1, x2, y2, color = C.line, lw = 2) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  measure(str, size, weight = 400) {
    const key = `${weight}|${size}|${str}`;
    let v = this.measureCache.get(key);
    if (v === undefined) {
      this.ctx.font = font(size, weight);
      v = this.ctx.measureText(str).width;
      if (this.measureCache.size > 20000) this.measureCache.clear();
      this.measureCache.set(key, v);
    }
    return v;
  }

  // single-line text; shrinks to fit maxW
  text(str, x, y, o = {}) {
    const { ctx } = this;
    let size = o.size || 36;
    const weight = o.weight || 400;
    str = String(str);
    if (o.maxW) {
      const w = this.measure(str, size, weight);
      if (w > o.maxW) size = Math.max(10, (size * o.maxW) / w);
    }
    ctx.font = font(size, weight);
    ctx.fillStyle = o.color || C.ink;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'middle';
    ctx.fillText(str, x, y);
    return this.measure(str, size, weight);
  }

  // ------------------------------------------------------------ rich text
  // Lays out mixed Korean / Japanese text with furigana markup, wrapping
  // Korean at spaces and Japanese per character with basic kinsoku.
  layout(str, maxW, o = {}) {
    const size = o.size || 36;
    const weight = o.weight || 400;
    const rsize = Math.round(size * 0.5);
    const furi = o.furigana ?? this.furigana;
    const tokens = typeof str === 'string' ? parseRuby(str) : str;
    const atoms = [];
    let lastBlank = false;
    let blankN = 0;
    for (const tk of tokens) {
      if (o.blank && tk.g) {
        if (!lastBlank) atoms.push({ blank: true, t: '', n: blankN++, w: o.blankW || size * 3.2 });
        lastBlank = true;
        continue;
      }
      lastBlank = false;
      if (tk.r) {
        const bw = this.measure(tk.t, size, weight);
        const rw = furi ? this.measure(tk.r, rsize, 400) : 0;
        atoms.push({ t: tk.t, r: furi ? tk.r : null, g: tk.g, bw, rw, w: Math.max(bw, rw) });
        continue;
      }
      for (const m of tk.t.matchAll(ATOM)) {
        const t = m[0];
        if (t === '\n') atoms.push({ br: true, t: '', w: 0 });
        else {
          const sp = /^[ \t　]+$/.test(t);
          atoms.push({ t, g: tk.g, sp, w: this.measure(t, size, weight) });
        }
      }
    }
    const hasRuby = furi && atoms.some((a) => a.r);
    const lh = size * (hasRuby ? 1.82 : 1.38) + (o.gap || 0);
    const lines = [];
    let cur = [];
    let x = 0;
    const push = () => {
      while (cur.length && cur[cur.length - 1].sp) cur.pop();
      lines.push({ atoms: cur, w: x });
      cur = [];
      x = 0;
    };
    for (const a0 of atoms) {
      if (a0.br) {
        push();
        continue;
      }
      if (a0.sp && !cur.length) continue;
      let pieces = [a0];
      // a single word wider than the line: split by char
      if (!a0.r && !a0.blank && a0.w > maxW) {
        pieces = [...a0.t].map((ch) => ({ t: ch, g: a0.g, w: this.measure(ch, size, weight) }));
      }
      for (const a of pieces) {
        if (x + a.w > maxW && cur.length) {
          const hang = !a.r && NO_START.includes(a.t[0]) && x + a.w <= maxW + size * 1.1;
          if (!hang) {
            let carry = null;
            const last = cur[cur.length - 1];
            if (cur.length > 1 && last && !last.r && NO_END.includes(last.t)) {
              carry = cur.pop();
              x -= carry.w;
            }
            push();
            if (carry) {
              carry.x = 0;
              cur.push(carry);
              x = carry.w;
            }
            if (a.sp) continue;
          }
        }
        a.x = x;
        cur.push(a);
        x += a.w;
      }
    }
    if (cur.length || !lines.length) push();
    if (o.maxLines && lines.length > o.maxLines) {
      lines.length = o.maxLines;
      const l = lines[lines.length - 1];
      l.atoms.push({ t: '…', x: l.w, w: size });
    }
    return { lines, lh, h: lines.length * lh, size, rsize, weight, hasRuby, maxW, blanks: blankN };
  }

  rich(str, x, y, maxW, o = {}) {
    const L = o.layout || this.layout(str, maxW, o);
    const { ctx } = this;
    const color = o.color || C.ink;
    const tcolor = o.targetColor || null;
    const align = o.align || 'left';
    const rubyH = L.hasRuby ? L.size * 0.62 : 0;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    L.lines.forEach((line, i) => {
      const top = y + i * L.lh;
      const base = top + rubyH + L.size * 0.98;
      let ox = x;
      if (align === 'center') ox = x + (maxW - line.w) / 2;
      else if (align === 'right') ox = x + maxW - line.w;
      for (const a of line.atoms) {
        const ax = ox + a.x;
        if (a.blank) {
          this.rect(ax + 4, base - L.size * 0.95, a.w - 8, L.size * 1.2, 10, 'rgba(229,180,81,0.14)', C.accent2, 3);
          ctx.font = font(L.size * 0.8, 700);
          ctx.fillStyle = C.accent2;
          ctx.textAlign = 'center';
          ctx.fillText(o.blankLabel || (L.blanks > 1 ? '①②③④'[a.n] || '？' : '？'), ax + a.w / 2, base - L.size * 0.08);
          ctx.textAlign = 'left';
          continue;
        }
        const col = a.g && tcolor ? tcolor : color;
        ctx.font = font(L.size, a.g && tcolor ? Math.max(L.weight, 700) : L.weight);
        ctx.fillStyle = col;
        if (a.r) {
          ctx.fillText(a.t, ax + (a.w - a.bw) / 2, base);
          ctx.font = font(L.rsize, 400);
          ctx.fillStyle = a.g && tcolor ? tcolor : o.rubyColor || C.sub;
          ctx.fillText(a.r, ax + (a.w - a.rw) / 2, base - L.size * 1.02);
        } else {
          ctx.fillText(a.t, ax, base);
        }
        if (a.g && tcolor) {
          ctx.fillStyle = tcolor;
          ctx.fillRect(ax, base + L.size * 0.14, a.w, 4);
        }
      }
    });
    return L.h;
  }

  // plain wrapped paragraph (no ruby); returns height
  para(str, x, y, maxW, o = {}) {
    return this.rich(str, x, y, maxW, { ...o, furigana: false });
  }

  // ------------------------------------------------------------ widgets
  hit(x, y, w, h, onClick, o = {}) {
    this.hits.push({ x, y, w, h, r: o.r ?? 18, onClick, key: o.key, sfx: o.sfx ?? 'click', label: o.label });
  }

  button(x, y, w, h, label, onClick, o = {}) {
    const style = o.style || 'normal';
    const r = o.r ?? Math.min(22, h / 2);
    let fill = C.card;
    let stroke = C.line;
    let color = C.ink;
    if (style === 'primary') {
      fill = o.color || C.accent;
      stroke = null;
      color = '#fff';
    } else if (style === 'ghost') {
      fill = 'rgba(255,255,255,0.04)';
    } else if (style === 'gold') {
      fill = C.accent2;
      color = '#2a2112';
      stroke = null;
    }
    if (o.state === 'ok') {
      fill = 'rgba(95,207,143,0.25)';
      stroke = C.ok;
    } else if (o.state === 'ng') {
      fill = 'rgba(240,104,90,0.25)';
      stroke = C.ng;
    } else if (o.state === 'dim') {
      color = C.dim;
    } else if (o.state === 'on') {
      fill = 'rgba(229,180,81,0.22)';
      stroke = C.accent2;
    }
    if (o.disabled) {
      fill = 'rgba(255,255,255,0.03)';
      color = C.dim;
      stroke = C.line;
    }
    this.rect(x, y, w, h, r, fill, stroke, o.state ? 4 : 2);
    const size = o.size || Math.min(40, h * 0.42);
    if (o.rich) {
      const L = this.layout(label, w - 40, { size, weight: o.weight || 500, furigana: o.furigana });
      const ty = y + (h - L.h) / 2;
      this.rich(label, x + 20, ty, w - 40, { layout: L, color, align: 'center' });
    } else if (o.sub) {
      this.text(label, x + w / 2, y + h * 0.4, { size, weight: o.weight || 600, color, align: 'center', maxW: w - 30 });
      this.text(o.sub, x + w / 2, y + h * 0.72, { size: size * 0.62, color: o.disabled ? C.dim : C.sub, align: 'center', maxW: w - 30 });
    } else {
      this.text(label, x + w / 2, y + h / 2 + 1, { size, weight: o.weight || 600, color, align: 'center', maxW: w - 30 });
    }
    if (o.badge) {
      this.text(o.badge, x + 18, y + 20, { size: 22, color: C.dim, weight: 700 });
    }
    if (!o.disabled && onClick) this.hit(x, y, w, h, onClick, { r, key: o.key, sfx: o.sfx, label });
  }

  // square tile with a kanji "icon"
  tile(x, y, w, h, o, onClick) {
    const col = o.color || C.accent2;
    this.rect(x, y, w, h, 26, o.disabled ? 'rgba(255,255,255,0.03)' : C.card, C.line);
    const cx = x + 70;
    const cy = y + h / 2;
    this.circle(cx, cy, 46, o.disabled ? 'rgba(255,255,255,0.05)' : col);
    this.text(o.icon, cx, cy + 2, { size: 50, weight: 700, color: o.disabled ? C.dim : '#1a1f2c', align: 'center' });
    this.text(o.title, x + 136, y + h / 2 - (o.sub ? 20 : 0), { size: 36, weight: 700, color: o.disabled ? C.dim : C.ink, maxW: w - 150 });
    if (o.sub) this.text(o.sub, x + 136, y + h / 2 + 26, { size: 25, color: C.sub, maxW: w - 150 });
    if (o.badge) {
      const bw = this.measure(o.badge, 24, 700) + 26;
      this.rect(x + w - bw - 14, y + 14, bw, 38, 19, C.accent);
      this.text(o.badge, x + w - bw / 2 - 14, y + 34, { size: 24, weight: 700, color: '#fff', align: 'center' });
    }
    if (!o.disabled && onClick) this.hit(x, y, w, h, onClick, { r: 26, label: o.title });
  }

  bar(x, y, w, h, frac, color = C.accent2, bg = 'rgba(255,255,255,0.08)') {
    this.rect(x, y, w, h, h / 2, bg);
    frac = Math.max(0, Math.min(1, frac || 0));
    if (frac > 0) this.rect(x, y, Math.max(h, w * frac), h, h / 2, color);
  }

  chip(x, y, label, color, o = {}) {
    const size = o.size || 24;
    const w = this.measure(label, size, 700) + size * 1.2;
    const h = size * 1.7;
    this.rect(x, y, w, h, h / 2, o.fill || 'rgba(0,0,0,0.25)', color, 2);
    this.text(label, x + w / 2, y + h / 2 + 1, { size, weight: 700, color, align: 'center' });
    return w;
  }

  // speaker icon button
  speaker(x, y, s, onClick, o = {}) {
    const { ctx } = this;
    this.circle(x + s / 2, y + s / 2, s / 2, o.fill || C.card2, C.line);
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.scale(s / 100, s / 100);
    ctx.fillStyle = o.color || C.ink;
    ctx.beginPath();
    ctx.moveTo(-26, -12);
    ctx.lineTo(-12, -12);
    ctx.lineTo(6, -28);
    ctx.lineTo(6, 28);
    ctx.lineTo(-12, 12);
    ctx.lineTo(-26, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = o.color || C.ink;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(8, 0, 16, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8, 0, 28, -0.9, 0.9);
    ctx.stroke();
    ctx.restore();
    if (onClick) this.hit(x, y, s, s, onClick, { r: s / 2, key: o.key, sfx: 'none' });
  }

  // top header with back button and title
  header(title, o = {}) {
    if (o.back) {
      this.button(36, 30, 150, 76, '‹ 뒤로', o.back, { style: 'ghost', size: 32, key: 'back' });
    }
    this.text(title, o.back ? 210 : 48, 68, { size: 46, weight: 700, maxW: this.w - 700 });
    if (o.right) o.right();
  }
}
