// Speech (pre-generated Open JTalk files, falling back to the browser's
// speechSynthesis) and procedural sound effects / ambient koto music.
import { store } from './store.js';

// FNV-1a 32-bit over UTF-8 bytes; any tool that pre-generates audio/ files must use the same key
function fnv(bytes, h = 0x811c9dc5) {
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const enc = new TextEncoder();
export function audioKey(text, voice = 'F') {
  const b = enc.encode(`${voice}|${text}`);
  const h1 = fnv(b).toString(16).padStart(8, '0');
  const h2 = fnv(b, 0x2f1d4c7b).toString(16).padStart(8, '0');
  return h1 + h2.slice(0, 4);
}

// Normalise text the same way the audio builder does
export function speakText(s) {
  return s.replace(/[{}｜]/g, '').replace(/\[[^\]]*\]/g, '').replace(/＿+★?＿*/g, '').trim();
}

export class Sound {
  constructor(base) {
    this.base = base;
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.current = null;
    this.seqToken = 0;
    this.jaVoice = null;
    this.fileMisses = 0;
    this.fileHits = 0;
    this.music = null;
    this.loadVoices();
  }

  loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const pickVoice = () => {
      const vs = speechSynthesis.getVoices();
      this.jaVoice = vs.find((v) => /ja[-_]JP/i.test(v.lang) && /google|natural|neural/i.test(v.name)) || vs.find((v) => /^ja/i.test(v.lang)) || null;
    };
    pickVoice();
    speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ttsAvailable() {
    return !!this.jaVoice;
  }

  stop() {
    this.seqToken++;
    try {
      this.current?.stop();
    } catch (e) {
      /* already stopped */
    }
    this.current = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  async loadBuffer(text, voice) {
    const key = audioKey(text, voice);
    if (this.buffers.has(key)) return this.buffers.get(key);
    const r = await fetch(`${this.base}audio/${key.slice(0, 2)}/${key}.ogg`);
    if (!r.ok) throw new Error('no file');
    const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
    if (this.buffers.size > 300) this.buffers.delete(this.buffers.keys().next().value);
    this.buffers.set(key, buf);
    return buf;
  }

  playBuffer(buf) {
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = store.d.settings.rate < 1 ? 0.9 : 1;
      const g = this.ctx.createGain();
      g.gain.value = 1.0;
      src.connect(g).connect(this.master);
      src.onended = () => resolve();
      src.start();
      this.current = src;
    });
  }

  tts(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve(false);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (this.jaVoice) u.voice = this.jaVoice;
      u.rate = store.d.settings.rate;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      speechSynthesis.speak(u);
      // some engines never fire onend
      setTimeout(() => resolve(true), 1500 + text.length * 260);
    });
  }

  // speak one utterance; returns a promise resolved when done
  async say(text, voice = 'F', { interrupt = true } = {}) {
    text = speakText(text);
    if (!text) return;
    if (interrupt) this.stop();
    const token = this.seqToken;
    this.unlock();
    const mode = store.d.settings.voice;
    // no pre-generated files deployed (several misses, zero hits) → go straight to TTS
    const filesGone = mode === 'auto' && this.fileMisses >= 3 && this.fileHits === 0;
    if (mode !== 'tts' && this.ctx && !filesGone) {
      try {
        const buf = await this.loadBuffer(text, voice);
        if (token !== this.seqToken) return;
        this.fileHits++;
        await this.playBuffer(buf);
        return;
      } catch (e) {
        this.fileMisses++;
        if (mode === 'files') return;
      }
    }
    if (token !== this.seqToken) return;
    await this.tts(text);
  }

  // play dialogue lines in order: [[voice, text], ...]
  async sequence(lines, gap = 450, onLine) {
    this.stop();
    const token = this.seqToken;
    for (let i = 0; i < lines.length; i++) {
      if (token !== this.seqToken) return false;
      onLine?.(i);
      await this.say(lines[i][1], lines[i][0], { interrupt: false });
      await new Promise((r) => setTimeout(r, gap));
    }
    onLine?.(-1);
    return token === this.seqToken;
  }

  // ------------------------------------------------------------ effects
  tone(freq, t0, dur, type = 'sine', vol = 0.2) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  sfx(name) {
    const v = store.d.settings.sfx;
    if (!v || name === 'none') return;
    this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    if (name === 'click') this.tone(1400, t, 0.05, 'triangle', 0.05 * v);
    else if (name === 'ok') {
      this.tone(1318.5, t, 0.25, 'sine', 0.22 * v);
      this.tone(1760, t + 0.09, 0.4, 'sine', 0.2 * v);
    } else if (name === 'ng') {
      this.tone(220, t, 0.28, 'triangle', 0.22 * v);
      this.tone(207.7, t + 0.08, 0.3, 'triangle', 0.18 * v);
    } else if (name === 'level') {
      [587.3, 740, 880, 1174.7, 1480].forEach((f, i) => this.tone(f, t + i * 0.11, 0.6, 'sine', 0.18 * v));
    } else if (name === 'page') this.tone(900, t, 0.06, 'sine', 0.06 * v);
  }

  // ------------------------------------------------------------ ambient koto
  startMusic() {
    if (this.music || !this.ctx) return;
    // miyako-bushi pentatonic (D Eb G A Bb) across two octaves
    const scale = [293.66, 311.13, 392.0, 440.0, 466.16, 587.33, 622.25, 784.0, 880.0];
    const bus = this.ctx.createGain();
    bus.gain.value = 0.0;
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.38;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.3;
    delay.connect(fb).connect(delay);
    bus.connect(this.master);
    bus.connect(delay);
    delay.connect(this.master);
    const pluck = (f, t, vol) => {
      const c = this.ctx;
      const o = c.createOscillator();
      const o2 = c.createOscillator();
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(f * 6, t);
      lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 1.2);
      o.type = 'triangle';
      o2.type = 'sawtooth';
      o.frequency.value = f;
      o2.frequency.value = f * 1.002;
      const g2 = c.createGain();
      g2.gain.value = 0.25;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(lp).connect(bus);
      o.start(t);
      o2.start(t);
      o.stop(t + 2.5);
      o2.stop(t + 2.5);
    };
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const vol = store.d.settings.music ?? 0.4;
      bus.gain.value = vol * 0.5;
      if (vol > 0 && this.ctx.state === 'running') {
        const t = this.ctx.currentTime + 0.05;
        const n = 1 + (Math.random() < 0.35 ? 1 : 0);
        for (let i = 0; i < n; i++) pluck(scale[Math.floor(Math.random() * scale.length)], t + i * 0.22, 0.09);
      }
      setTimeout(loop, 1400 + Math.random() * 2600);
    };
    loop();
    this.music = { stop: () => { alive = false; } };
  }
}
