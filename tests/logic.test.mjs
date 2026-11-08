import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, buildQuestion, hasAccess, publicQuestion, BLUEPRINT, round2 } from '../netlify/lib/logic.mjs';

test('rasmiy imtihon jami 30 savol va 78 ball', () => {
  assert.equal(BLUEPRINT.reduce((s, b) => s + b[1], 0), 30);
  assert.equal(round2(BLUEPRINT.reduce((s, b) => s + b[1] * b[2], 0)), 78);
});

test('Y1 baholash (satr/son farqi hisobga olinmaydi)', () => {
  const q = { question_type: 'Y1', correct_answer: 2 };
  assert.equal(gradeAnswer(q, '2'), true);
  assert.equal(gradeAnswer(q, 2), true);
  assert.equal(gradeAnswer(q, 1), false);
  assert.equal(gradeAnswer(q, null), false);
  assert.equal(gradeAnswer({ question_type: 'Y1', correct_answer: 0 }, ''), false);
});

test('Y2 baholash tartibga bog‘liq emas, qisman javob xato', () => {
  const q = { question_type: 'Y2', correct_answer: [0, 2] };
  assert.equal(gradeAnswer(q, ['2', '0']), true);
  assert.equal(gradeAnswer(q, [0]), false);
  assert.equal(gradeAnswer(q, [0, 1, 2]), false);
  assert.equal(gradeAnswer(q, []), false);
});

test('Y3 va Y4 baholash', () => {
  assert.equal(gradeAnswer({ question_type: 'Y3', correct_answer: { 0: 1, 1: 0 } }, { 0: '1', 1: 0 }), true);
  assert.equal(gradeAnswer({ question_type: 'Y3', correct_answer: { 0: 1, 1: 0 } }, { 0: 1 }), false);
  assert.equal(gradeAnswer({ question_type: 'Y4', correct_answer: [2, 0, 1] }, [2, 0, 1]), true);
  assert.equal(gradeAnswer({ question_type: 'Y4', correct_answer: [2, 0, 1] }, [0, 2, 1]), false);
});

test('buildQuestion Y1/Y2: 1 dan boshlanadigan raqamlar', () => {
  const a = buildQuestion({ type: 'Y1', text: 'S?', options: 'a\nb\nc', correct: 2 });
  assert.equal(a.correct_answer, 1);
  const b = buildQuestion({ type: 'Y2', text: 'S?', options: ['a', 'b', 'c'], correct: '1, 3' });
  assert.deepEqual(b.correct_answer, [0, 2]);
  assert.throws(() => buildQuestion({ type: 'Y1', text: 'S?', options: 'a\nb', correct: 3 }));
});

test('buildQuestion Y3: kalit aralashtirilgan juftlarga mos', () => {
  const q = buildQuestion({ type: 'Y3', text: 'Moslang', options: 'A => 1\nB => 2\nC => 3' });
  q.options.left.forEach((l, i) => {
    const expected = { A: '1', B: '2', C: '3' }[l];
    assert.equal(q.options.right[q.correct_answer[String(i)]], expected);
  });
  assert.equal(gradeAnswer({ question_type: 'Y3', correct_answer: q.correct_answer }, q.correct_answer), true);
});

test('buildQuestion Y4: to‘g‘ri tartib aralashtiriladi, kalit to‘g‘ri', () => {
  const items = ['1-qadam', '2-qadam', '3-qadam', '4-qadam'];
  const q = buildQuestion({ type: 'Y4', text: 'Tartiblang', options: items });
  assert.deepEqual(q.correct_answer.map((i) => q.options[i]), items);
  assert.notDeepEqual(q.options, items);
});

test('publicQuestion javob kalitini yashiradi', () => {
  const p = publicQuestion({ id: 'x', question_text: 't', question_type: 'Y1', options: ['a'], correct_answer: 0, explanation: 'e', points: 1, sort_order: 1 }, 3.1);
  assert.equal('correct_answer' in p, false);
  assert.equal('explanation' in p, false);
  assert.equal(p.points, 3.1);
});

test('hasAccess', () => {
  const day = 864e5;
  const ok = { role: 'candidate', status: 'approved', access_until: new Date(Date.now() + day).toISOString() };
  assert.equal(hasAccess(ok), true);
  assert.equal(hasAccess({ ...ok, access_until: new Date(Date.now() - day).toISOString() }), false);
  assert.equal(hasAccess({ ...ok, status: 'blocked' }), false);
  assert.equal(hasAccess({ ...ok, access_from: new Date(Date.now() + day).toISOString() }), false);
  assert.equal(hasAccess({ role: 'admin', status: 'pending' }), true);
});
