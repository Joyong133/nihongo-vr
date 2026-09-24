// Palette: deep indigo panels, washi-cream ink, vermilion + gold accents.
export const C = {
  bg: '#161c2b',
  bg2: '#1f2739',
  card: '#26304a',
  card2: '#2e3a58',
  line: 'rgba(243, 237, 224, 0.14)',
  ink: '#f3ede0',
  sub: '#b9b3a6',
  dim: '#7f8698',
  accent: '#ef5b3f', // 朱
  accent2: '#e5b451', // 金
  indigo: '#4f7cc4', // 藍
  ok: '#5fcf8f',
  ng: '#f0685a',
  kana: '#f28fb0',
  kanji: '#e5b451',
  vocab: '#5fb8e8',
  grammar: '#a58cf2',
  reading: '#6fd0b8',
  listening: '#f39a5b',
};

export const FAMILY = '"NJP", "NKR", "Noto Sans JP", "Noto Sans KR", sans-serif';
export const font = (size, weight = 400) => `${weight} ${Math.round(size)}px ${FAMILY}`;

export const TYPE_COLOR = {
  kana: C.kana,
  kanji: C.kanji,
  vocab: C.vocab,
  grammar: C.grammar,
  reading: C.reading,
  listening: C.listening,
};
export const TYPE_NAME = {
  kana: '가나',
  kanji: '한자',
  vocab: '단어',
  grammar: '문법',
  reading: '독해',
  listening: '청해',
};
