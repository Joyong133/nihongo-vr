// Verb / adjective conjugation engine + drill question generator.
// Verb types: 5 godan, 5r honorific godan (いらっしゃる…), 1 ichidan,
//             k 来る, s する(compound), i い-adjective, na な-adjective
const ROW = {
  'う': 'わいうえお', 'く': 'かきくけこ', 'ぐ': 'がぎぐげご', 'す': 'さしすせそ', 'つ': 'たちつてと',
  'ぬ': 'なにぬねの', 'ぶ': 'ばびぶべぼ', 'む': 'まみむめも', 'る': 'らりるれろ',
};
const TE = { 'う': 'って', 'つ': 'って', 'る': 'って', 'む': 'んで', 'ぶ': 'んで', 'ぬ': 'んで', 'く': 'いて', 'ぐ': 'いで', 'す': 'して' };

export const VERB_FORMS = [
  ['masu', 'ます형', '정중하게 (~합니다)'],
  ['nai', 'ない형', '부정 (~하지 않다)'],
  ['te', 'て형', '연결 (~하고, ~해서)'],
  ['ta', 'た형', '과거 (~했다)'],
  ['nakatta', 'なかった형', '과거 부정 (~하지 않았다)'],
  ['tara', 'たら형', '가정 (~하면, ~했더니)'],
  ['ba', 'ば형', '가정 (~하면)'],
  ['pot', '가능형', '~할 수 있다'],
  ['vol', '의지형', '~하자, ~해야지'],
  ['imp', '명령형', '~해라'],
  ['proh', '금지형', '~하지 마라'],
  ['pass', '수동형', '~당하다, ~되다'],
  ['caus', '사역형', '~하게 하다, ~시키다'],
  ['causpass', '사역수동형', '(억지로) ~하게 되다'],
];
export const ADJ_FORMS = [
  ['neg', '부정', '~하지 않다'],
  ['past', '과거', '~했다'],
  ['pastneg', '과거 부정', '~하지 않았다'],
  ['te', 'て형', '~하고, ~해서'],
  ['adv', '부사형', '~하게'],
  ['ba', '가정형', '~하면'],
];
export const FORM_LEVEL = { masu: 'n5', nai: 'n5', te: 'n5', ta: 'n5', nakatta: 'n5', tara: 'n4', ba: 'n4', pot: 'n4', vol: 'n4', imp: 'n4', proh: 'n4', pass: 'n4', caus: 'n4', causpass: 'n3' };

function godan(stem, last, form, word) {
  const r = ROW[last];
  const a = last === 'う' ? 'わ' : r[0];
  const iku = word.endsWith('行く') || word.endsWith('いく');
  const teRaw = iku ? 'って' : TE[last];
  const ta = teRaw.replace('て', 'た').replace('で', 'だ');
  switch (form) {
    case 'masu': return stem + r[1] + 'ます';
    case 'nai': return word.endsWith('ある') && last === 'る' && stem.endsWith('あ') ? stem.slice(0, -1) + 'ない' : stem + a + 'ない';
    case 'nakatta': return word.endsWith('ある') && stem.endsWith('あ') ? stem.slice(0, -1) + 'なかった' : stem + a + 'なかった';
    case 'te': return stem + teRaw;
    case 'ta': return stem + ta;
    case 'tara': return stem + ta + 'ら';
    case 'ba': return stem + r[3] + 'ば';
    case 'pot': return stem + r[3] + 'る';
    case 'vol': return stem + r[4] + 'う';
    case 'imp': return stem + r[3];
    case 'proh': return stem + last + 'な';
    case 'pass': return stem + a + 'れる';
    case 'caus': return stem + a + 'せる';
    case 'causpass': return last === 'す' ? stem + 'させられる' : stem + a + 'される';
  }
  return null;
}

function ichidan(stem, form) {
  switch (form) {
    case 'masu': return stem + 'ます';
    case 'nai': return stem + 'ない';
    case 'nakatta': return stem + 'なかった';
    case 'te': return stem + 'て';
    case 'ta': return stem + 'た';
    case 'tara': return stem + 'たら';
    case 'ba': return stem + 'れば';
    case 'pot': return stem + 'られる';
    case 'vol': return stem + 'よう';
    case 'imp': return stem + 'ろ';
    case 'proh': return stem + 'るな';
    case 'pass': return stem + 'られる';
    case 'caus': return stem + 'させる';
    case 'causpass': return stem + 'させられる';
  }
  return null;
}

const KURU = { masu: ['き', 'ます'], nai: ['こ', 'ない'], nakatta: ['こ', 'なかった'], te: ['き', 'て'], ta: ['き', 'た'], tara: ['き', 'たら'], ba: ['く', 'れば'], pot: ['こ', 'られる'], vol: ['こ', 'よう'], imp: ['こ', 'い'], proh: ['く', 'るな'], pass: ['こ', 'られる'], caus: ['こ', 'させる'], causpass: ['こ', 'させられる'] };
const SURU = { masu: 'します', nai: 'しない', nakatta: 'しなかった', te: 'して', ta: 'した', tara: 'したら', ba: 'すれば', pot: 'できる', vol: 'しよう', imp: 'しろ', proh: 'するな', pass: 'される', caus: 'させる', causpass: 'させられる' };

function adjI(stem, form, word) {
  const ii = word === 'いい' || word.endsWith('いい');
  const s = ii ? stem.slice(0, -1) + 'よ' : stem;
  switch (form) {
    case 'neg': return s + 'くない';
    case 'past': return s + 'かった';
    case 'pastneg': return s + 'くなかった';
    case 'te': return s + 'くて';
    case 'adv': return s + 'く';
    case 'ba': return s + 'ければ';
  }
  return null;
}

function adjNa(stem, form) {
  switch (form) {
    case 'neg': return stem + 'じゃない';
    case 'past': return stem + 'だった';
    case 'pastneg': return stem + 'じゃなかった';
    case 'te': return stem + 'で';
    case 'adv': return stem + 'に';
    case 'ba': return stem + 'なら';
  }
  return null;
}

// conjugate one string (written or reading) of a word
function conjStr(s, type, form) {
  if (type === 'na') return adjNa(s.replace(/な$/, ''), form);
  if (type === 'i') return adjI(s.slice(0, -1), form, s);
  if (type === 's') return s.slice(0, -2) + SURU[form];
  if (type === 'k') {
    const pre = s.slice(0, -1); // drop る
    const [st, suf] = KURU[form];
    if (pre.endsWith('来')) return pre + suf;
    return pre.slice(0, -1) + st + suf;
  }
  if (type === '1') return ichidan(s.slice(0, -1), form);
  if (type === '5r') {
    if (form === 'masu') return s.slice(0, -1) + 'います';
    if (form === 'imp') return s.slice(0, -1) + 'い';
    return godan(s.slice(0, -1), 'る', form, s);
  }
  return godan(s.slice(0, -1), s.slice(-1), form, s);
}

// forms that are unnatural for some verbs (あれる, いらっしゃられる, 分かれる …)
const BASIC = ['masu', 'nai', 'te', 'ta', 'nakatta', 'tara', 'ba'];
const NO_VOLITION = ['ある', '要る', '分かる', 'いる'];
export function formOK(v, form) {
  const [w, , type] = v;
  if (type === '5r') return BASIC.includes(form) || form === 'imp';
  if (NO_VOLITION.includes(w)) return BASIC.includes(form);
  return true;
}

export function conjugate(v, form) {
  const [w, r, type] = v;
  return { w: conjStr(w, type, form), r: conjStr(r, type, form) };
}

// plausible wrong answers: wrong verb class, wrong te-endings, other forms
export function wrongForms(v, form) {
  const [w, , type] = v;
  const right = conjStr(w, type, form);
  const cands = new Set();
  const isAdj = type === 'i' || type === 'na';
  const forms = (isAdj ? ADJ_FORMS : VERB_FORMS).map((f) => f[0]);
  if (!isAdj) {
    if (w.endsWith('る')) {
      cands.add(conjStr(w, type === '1' ? '5' : '1', form));
    }
    if (type === '5' || type === '1') {
      const last = w.slice(-1);
      const stem = w.slice(0, -1);
      if (form === 'te' || form === 'ta' || form === 'tara') {
        for (const e of ['って', 'んで', 'いて', 'いで', 'して', 'て']) {
          let x = stem + e;
          if (form === 'ta') x = x.replace(/て$/, 'た').replace(/で$/, 'だ');
          if (form === 'tara') x = x.replace(/て$/, 'たら').replace(/で$/, 'だら');
          cands.add(x);
        }
        if (ROW[last]) cands.add(stem + ROW[last][1] + (form === 'te' ? 'て' : form === 'ta' ? 'た' : 'たら'));
      }
      if (form === 'nai' && ROW[last]) cands.add(stem + ROW[last][1] + 'ない');
      if (form === 'pot' && ROW[last]) cands.add(stem + (last === 'う' ? 'わ' : ROW[last][0]) + 'れる');
      if (form === 'vol' && ROW[last]) cands.add(stem + ROW[last][4] + 'よう');
    }
  } else if (type === 'i') {
    cands.add(adjNa(w, form));
  } else if (w.endsWith('い')) {
    cands.add(adjI(w.slice(0, -1), form, w));
  }
  for (const f of forms) if (f !== form) cands.add(conjStr(w, type, f));
  cands.delete(right);
  cands.delete(null);
  return [...cands];
}
