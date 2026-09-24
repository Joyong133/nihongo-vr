// Furigana markup used across all content:
//   漢字[かんじ]   ruby over the run of kanji right before '['
//   ｜東京駅[とうきょうえき] ruby over everything since '｜'
//   {…}           the grammar target (highlighted, or blanked in quizzes)
export const isKanji = (ch) => /[㐀-鿿豈-﫿々〆ヶ]/.test(ch);
export const isKana = (ch) => /[぀-ヿ]/.test(ch);

export function parseRuby(s) {
  const out = [];
  let buf = '';
  let target = false;
  let bar = false;
  const flush = () => {
    if (buf) out.push({ t: buf, r: null, g: target });
    buf = '';
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') { flush(); target = true; continue; }
    if (ch === '}') { flush(); target = false; continue; }
    if (ch === '｜') { flush(); bar = true; continue; }
    if (ch === '[') {
      const j = s.indexOf(']', i);
      if (j < 0) { buf += ch; continue; }
      const reading = s.slice(i + 1, j);
      let base;
      if (bar) {
        base = buf;
        buf = '';
        bar = false;
      } else {
        let k = buf.length;
        while (k > 0 && isKanji(buf[k - 1])) k--;
        base = buf.slice(k);
        buf = buf.slice(0, k);
      }
      flush();
      out.push({ t: base, r: reading, g: target });
      i = j;
      continue;
    }
    buf += ch;
  }
  flush();
  return out;
}

export const plain = (s) => parseRuby(s).map((t) => t.t).join('');
export const kanaOnly = (s) => parseRuby(s).map((t) => t.r || t.t).join('');
export const targetText = (s) => parseRuby(s).filter((t) => t.g).map((t) => t.t).join('');
export const hasKanji = (s) => [...s].some(isKanji);

// Build ruby markup for a vocabulary word from its written form and reading,
// attaching the reading to the kanji part only (食べる + たべる → 食[た]べる).
export function wordRuby(word, reading) {
  reading = reading.split(/[;；、,]/)[0].trim();
  if (!hasKanji(word) || word === reading) return word;
  // strip common okurigana suffix/prefix shared by both forms
  let a = 0;
  while (a < word.length && a < reading.length && word[a] === reading[a] && !isKanji(word[a])) a++;
  let b = 0;
  while (
    b < word.length - a && b < reading.length - a &&
    word[word.length - 1 - b] === reading[reading.length - 1 - b] && !isKanji(word[word.length - 1 - b])
  ) b++;
  const pre = word.slice(0, a);
  const mid = word.slice(a, word.length - b);
  const midR = reading.slice(a, reading.length - b);
  const post = word.slice(word.length - b);
  if (!mid || !midR) return word;
  return `${pre}｜${mid}[${midR}]${post}`;
}

// katakana <-> hiragana
export const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const toKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
