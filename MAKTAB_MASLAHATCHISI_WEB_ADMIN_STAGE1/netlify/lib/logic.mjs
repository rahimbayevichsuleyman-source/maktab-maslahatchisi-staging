import crypto from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const BLUEPRINT = [['c1', 5, 3.1], ['c2', 6, 3.1], ['c3', 4, 3.1], ['c4', 5, 2.1], ['c5', 4, 2.1], ['c6', 6, 2.1]];
export const EXAM_MINUTES = 80;
export const GRACE_SECONDS = 120;

export const isAdmin = (u) => ['super_admin', 'admin'].includes(u?.role);
export const round2 = (n) => Math.round(n * 100) / 100;

export function hasAccess(u, now = new Date()) {
  if (!u) return false;
  if (isAdmin(u)) return true;
  if (u.status !== 'approved' || !u.access_until) return false;
  if (new Date(u.access_until) <= now) return false;
  if (u.access_from && new Date(u.access_from) > now) return false;
  return true;
}

export function shuffle(arr) {
  const x = [...arr];
  for (let i = x.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

const toInt = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean') ? NaN : Number(v);

/** Javobni serverda tekshiradi. Qisman ball yo'q: to'liq to'g'ri bo'lsagina true. */
export function gradeAnswer(q, answer) {
  const c = q.correct_answer;
  switch (q.question_type) {
    case 'Y1': {
      const a = toInt(answer);
      return Number.isInteger(a) && a === toInt(c);
    }
    case 'Y2': {
      if (!Array.isArray(answer) || !Array.isArray(c)) return false;
      const a = [...new Set(answer.map(toInt))].sort((x, y) => x - y);
      const b = c.map(toInt).sort((x, y) => x - y);
      return a.length > 0 && a.length === b.length && a.every((v, i) => v === b[i]);
    }
    case 'Y3': {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer) || !c || typeof c !== 'object') return false;
      const keys = Object.keys(c);
      return Object.keys(answer).length === keys.length &&
        keys.every((k) => Number.isInteger(toInt(answer[k])) && toInt(answer[k]) === toInt(c[k]));
    }
    case 'Y4': {
      if (!Array.isArray(answer) || !Array.isArray(c) || answer.length !== c.length) return false;
      return c.every((v, i) => toInt(answer[i]) === toInt(v));
    }
    default: return false;
  }
}

const clean = (v) => String(v ?? '').trim();
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map(clean).filter(Boolean);
const page = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

function shuffledDifferent(arr) {
  if (arr.length < 2) return [...arr];
  for (let i = 0; i < 20; i++) {
    const s = shuffle(arr);
    if (s.some((v, k) => v !== arr[k])) return s;
  }
  return [...arr].reverse();
}

/**
 * Admin kiritgan inson o'qiy oladigan formatni bazaga saqlanadigan ko'rinishga o'tkazadi.
 *  Y1: options = variantlar, correct = to'g'ri variant raqami (1 dan)
 *  Y2: options = variantlar, correct = raqamlar ("1,3" yoki [1,3])
 *  Y3: options = "Element => Juft" qatorlari; javob kaliti avtomatik tuziladi
 *  Y4: options = elementlar TO'G'RI tartibda; aralashtirilib saqlanadi, kalit avtomatik tuziladi
 */
export function buildQuestion(input) {
  const type = clean(input.question_type ?? input.type) || 'Y1';
  if (!['Y1', 'Y2', 'Y3', 'Y4'].includes(type)) throw new AppError('Savol turi Y1, Y2, Y3 yoki Y4 bo‘lishi kerak.');
  const text = clean(input.question_text ?? input.text);
  if (!text) throw new AppError('Savol matni kiritilishi shart.');
  if (text.length > 4000) throw new AppError('Savol matni juda uzun (4000 belgigacha).');
  const lines = list(input.options);
  if (lines.some((l) => l.length > 500)) throw new AppError('Variant matni 500 belgidan oshmasligi kerak.');

  let options, correct;
  if (type === 'Y1' || type === 'Y2') {
    if (lines.length < 2 || lines.length > 10) throw new AppError('Variantlar soni 2 dan 10 gacha bo‘lishi kerak.');
    if (new Set(lines).size !== lines.length) throw new AppError('Variantlar takrorlanmasligi kerak.');
    const toIdx = (n) => {
      const k = Number(n) - 1;
      if (!Number.isInteger(k) || k < 0 || k >= lines.length) throw new AppError(`To‘g‘ri javob raqami 1 dan ${lines.length} gacha bo‘lishi kerak.`);
      return k;
    };
    options = lines;
    if (type === 'Y1') {
      correct = toIdx(input.correct ?? input.correct_answer);
    } else {
      const raw = input.correct ?? input.correct_answer;
      const arr = Array.isArray(raw) ? raw : String(raw ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      correct = [...new Set(arr.map(toIdx))].sort((a, b) => a - b);
      if (!correct.length) throw new AppError('Kamida bitta to‘g‘ri javob ko‘rsating.');
    }
  } else if (type === 'Y3') {
    const pairs = lines.map((l) => l.split('=>').map(clean));
    if (pairs.length < 2 || pairs.length > 8 || pairs.some((p) => p.length !== 2 || !p[0] || !p[1]))
      throw new AppError('Y3 uchun 2–8 qator kerak, har biri "Element => Juft" ko‘rinishida.');
    const left = pairs.map((p) => p[0]); const rightOrdered = pairs.map((p) => p[1]);
    if (new Set(left).size !== left.length || new Set(rightOrdered).size !== rightOrdered.length)
      throw new AppError('Y3 elementlari va juftlari takrorlanmasligi kerak.');
    const right = shuffledDifferent(rightOrdered);
    options = { left, right };
    correct = Object.fromEntries(left.map((_, i) => [String(i), right.indexOf(rightOrdered[i])]));
  } else {
    if (lines.length < 2 || lines.length > 8) throw new AppError('Y4 uchun 2–8 ta element kerak (to‘g‘ri tartibda).');
    if (new Set(lines).size !== lines.length) throw new AppError('Y4 elementlari takrorlanmasligi kerak.');
    options = shuffledDifferent(lines);
    correct = lines.map((it) => options.indexOf(it));
  }

  const points = Number(input.points);
  const ps = page(input.source_page_start ?? input.page_start);
  const pe = page(input.source_page_end ?? input.page_end);
  if (ps && pe && pe < ps) throw new AppError('Manba sahifasi tugashi boshlanishidan kichik bo‘lmasligi kerak.');
  return {
    question_type: type, question_text: text, options, correct_answer: correct,
    explanation: clean(input.explanation).slice(0, 2000) || null,
    points: points > 0 && points <= 100 ? points : 1,
    source_page_start: ps, source_page_end: pe
  };
}

/** Nomzodga faqat xavfsiz maydonlar yuboriladi (javob kaliti, izoh, manba yo'q). */
export const publicQuestion = (q, points) => ({
  id: q.id, question_text: q.question_text, question_type: q.question_type,
  options: q.options, points: points ?? q.points, sort_order: q.sort_order
});
