import crypto from 'node:crypto';
import { adminIds, validateConfig } from '../lib/config.mjs';
import { createClient } from '@supabase/supabase-js';
import {
  AppError, BLUEPRINT, EXAM_MINUTES, GRACE_SECONDS, isAdmin, hasAccess, shuffle, round2,
  gradeAnswer, buildQuestion, publicQuestion
} from '../lib/logic.mjs';

const supabase = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const webAuth = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const WEB_SESSION_COOKIE = 'mc_web_admin_session';
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});
const nowIso = () => new Date().toISOString();
const must = ({ data, error }) => { if (error) throw error; return data; };
const superIds = () => adminIds();

function cookieValue(event, name) {
  const cookies = event.headers?.cookie || event.headers?.Cookie || '';
  const pair = cookies.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : '';
}

function requireSameOrigin(event) {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin;
  const host = headers['x-forwarded-host'] || headers.host || headers.Host;
  let parsed;
  try { parsed = new URL(origin); } catch { throw new AppError('So‘rov manbasi tasdiqlanmadi.', 403); }
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(host || ''));
  if (!host || parsed.host.toLowerCase() !== String(host).toLowerCase() || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')))
    throw new AppError('So‘rov manbasi tasdiqlanmadi.', 403);
}

const sessionCookie = (token) => `${WEB_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
const expiredSessionCookie = `${WEB_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

async function webAdminLogin(body, db) {
  if (!process.env.SUPABASE_ANON_KEY) throw new AppError('Web administrator login sozlamasi to‘liq emas.', 503);
  const email = str(body.email, 254).toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password || password.length > 1024) throw new AppError('Email yoki parol noto‘g‘ri.', 401);

  let result;
  try { result = await webAuth().auth.signInWithPassword({ email, password }); }
  catch { throw new AppError('Kirish xizmati vaqtincha ishlamayapti.', 503); }
  const authUser = result.data?.user;
  if (result.error || !authUser?.id || !result.data?.session) throw new AppError('Email yoki parol noto‘g‘ri.', 401);
  if (!authUser.email_confirmed_at && !authUser.confirmed_at) throw new AppError('Email manzili tasdiqlanmagan.', 403);

  const access = must(await db.from('mc_web_admins').select('role,active').eq('auth_user_id', authUser.id).maybeSingle());
  if (!access?.active || !['admin', 'super_admin'].includes(access.role)) throw new AppError('Ushbu hisobga administrator paneliga kirish berilmagan.', 403);
  const token = sign({ kind: 'web_admin', uid: authUser.id, email: authUser.email, exp: Date.now() + 12 * 60 * 60 * 1000 });
  return { token, user: { email: authUser.email, role: access.role } };
}

/* ---------- Sessiya (HMAC imzolangan token) ---------- */
const b64 = (v) => Buffer.from(v).toString('base64url');
const hmac = (body) => crypto.createHmac('sha256', process.env.APP_SESSION_SECRET).update(body).digest();
const sign = (payload) => { const body = b64(JSON.stringify(payload)); return `${body}.${hmac(body).toString('base64url')}`; };
function verifySession(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  let got; try { got = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

/* ---------- Telegram initData tekshiruvi ---------- */
function verifyTelegram(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new AppError('Telegram sozlamasi topilmadi.', 500);
  if (!initData) throw new AppError('Ilovani Telegram bot orqali oching.', 401);
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new AppError('Telegram imzo ma’lumoti yo‘q.', 401);
  params.delete('hash');
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) throw new AppError('Telegram sessiyasi eskirgan. Botni qayta oching.', 401);
  const dataCheck = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== calc.length || !crypto.timingSafeEqual(calc, given)) throw new AppError('Telegram imzosi tasdiqlanmadi.', 401);
  let user; try { user = JSON.parse(params.get('user') || '{}'); } catch { user = {}; }
  if (!user.id) throw new AppError('Telegram foydalanuvchisi aniqlanmadi.', 401);
  return user;
}

async function requireUser(event, db) {
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (token) {
    const session = verifySession(token);
    if (!session) throw new AppError('Sessiya yaroqsiz. Qayta kirilmoqda…', 401);
    const user = must(await db.from('mc_users').select('*').eq('id', session.uid).maybeSingle());
    if (!user) throw new AppError('Foydalanuvchi profili topilmadi.', 401);
    return { ...user, auth_kind: 'telegram' };
  }

  const webToken = cookieValue(event, WEB_SESSION_COOKIE);
  const session = verifySession(webToken);
  if (!session || session.kind !== 'web_admin') throw new AppError('Web administrator sessiyasi yaroqsiz. Qayta kiring.', 401);
  requireSameOrigin(event);
  const access = must(await db.from('mc_web_admins').select('role,active').eq('auth_user_id', session.uid).maybeSingle());
  if (!access?.active || !['admin', 'super_admin'].includes(access.role)) throw new AppError('Administrator hisobiga kirish bekor qilingan.', 403);
  return { id: session.uid, email: session.email, role: access.role, status: 'approved', auth_kind: 'web_admin' };
}
const requireAdmin = (u) => { if (!isAdmin(u)) throw new AppError('Administrator huquqi talab qilinadi.', 403); };

function shapeUser(u) {
  return {
    id: u.id, telegram_id: u.telegram_id, full_name: u.full_name, username: u.username, phone: u.phone,
    organization: u.organization, position: u.position, role: u.role, status: u.status,
    access_from: u.access_from, access_until: u.access_until
  };
}

const str = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const uuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''));

/* ---------- Test boshlash yordamchilari ---------- */
function attemptPayload(attempt, questions, pointsMap, remainingSeconds) {
  return {
    attempt_id: attempt.id, title: attempt.test_title, mode: attempt.mode,
    duration_minutes: attempt.duration_minutes, remaining_seconds: remainingSeconds,
    max_score: Number(attempt.max_score),
    questions: questions.map((q) => publicQuestion(q, pointsMap[q.id]))
  };
}

async function buildExam(db) {
  const codes = BLUEPRINT.map((b) => b[0]);
  const cats = must(await db.from('mc_competencies').select('id,code').in('code', codes));
  const questions = []; const pointsMap = {};
  for (const [code, count, points] of BLUEPRINT) {
    const cat = cats.find((c) => c.code === code);
    if (!cat) throw new AppError(`Kompetensiya ${code} topilmadi.`, 500);
    const pool = must(await db.from('mc_questions').select('*,mc_tests!inner(is_published)')
      .eq('competency_id', cat.id).eq('active', true).eq('mc_tests.is_published', true));
    if ((pool || []).length < count) throw new AppError(`Rasmiy imtihon hozircha tayyor emas: ${code.toUpperCase()} kompetensiyasida ${count} ta savol kerak, mavjud — ${(pool || []).length}.`, 409);
    for (const q of shuffle(pool).slice(0, count)) { questions.push(q); pointsMap[q.id] = points; }
  }
  return { questions: shuffle(questions), pointsMap };
}

async function handleAction(action, body, event, db) {
  /* ===== AUTH ===== */
  if (action === 'auth') {
    const tg = verifyTelegram(body.initData);
    const telegramId = String(tg.id);
    const isSuper = superIds().includes(telegramId);
    let user = must(await db.from('mc_users').select('*').eq('telegram_id', telegramId).maybeSingle());
    if (!user) {
      const row = {
        telegram_id: telegramId,
        full_name: [tg.first_name, tg.last_name].filter(Boolean).join(' ') || tg.username || 'Nomzod',
        username: tg.username || null,
        role: isSuper ? 'super_admin' : 'candidate',
        status: isSuper ? 'approved' : 'pending'
      };
      const { data, error } = await db.from('mc_users').insert(row).select().single();
      if (error && error.code === '23505') user = must(await db.from('mc_users').select('*').eq('telegram_id', telegramId).maybeSingle());
      else if (error) throw error;
      else user = data;
    } else {
      const patch = {};
      if ((tg.username || null) !== user.username) patch.username = tg.username || null;
      if (isSuper && (user.role !== 'super_admin' || user.status !== 'approved')) { patch.role = 'super_admin'; patch.status = 'approved'; }
      if (Object.keys(patch).length) user = must(await db.from('mc_users').update(patch).eq('id', user.id).select().single());
    }
    const token = sign({ uid: user.id, exp: Date.now() + 12 * 60 * 60 * 1000 });
    return { token, user: shapeUser(user) };
  }

  const user = await requireUser(event, db);

  if (action.startsWith('web_') && user.auth_kind !== 'web_admin') throw new AppError('Web administrator sessiyasi talab qilinadi.', 403);
  if (action === 'web_me') return { user: { email: user.email, role: user.role } };
  if (action === 'web_dashboard') {
    requireAdmin(user);
    const getCount = async (query) => {
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    };
    const [users, literature, tests, questions, attempts] = await Promise.all([
      getCount(db.from('mc_users').select('id', { count: 'exact', head: true })),
      getCount(db.from('mc_literature').select('id', { count: 'exact', head: true })),
      getCount(db.from('mc_tests').select('id', { count: 'exact', head: true })),
      getCount(db.from('mc_questions').select('id', { count: 'exact', head: true }).eq('active', true)),
      getCount(db.from('mc_attempts').select('id', { count: 'exact', head: true }).eq('status', 'completed'))
    ]);
    return { metrics: { users, literature, tests, questions, completed_attempts: attempts } };
  }

  /* ===== NOMZOD ===== */
  if (action === 'bootstrap') {
    const [cats, books, tests, attempts, chapters, stats] = await Promise.all([
      db.from('mc_competencies').select('*').eq('active', true).order('sort_order'),
      db.from('mc_literature').select('id,title,author,total_pages,description,competency_id').eq('active', true).order('created_at', { ascending: false }),
      db.from('mc_tests').select('id,title,description,competency_id,literature_id,chapter_id,mode,duration_minutes').eq('is_published', true).order('created_at', { ascending: false }),
      db.from('mc_attempts').select('id,mode,test_title,score,max_score,percentage,correct_count,question_count,completed_at')
        .eq('user_id', user.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(30),
      db.from('mc_chapters').select('id,literature_id,chapter_number,title,sort_order').order('sort_order'),
      db.from('mc_user_competency_stats').select('*').eq('user_id', user.id)
    ]);
    return {
      user: shapeUser(user), competencies: must(cats), literature: must(books), chapters: must(chapters),
      tests: must(tests), attempts: must(attempts), stats: stats.data || []
    };
  }

  if (action === 'profile_update') {
    const patch = {};
    if (body.full_name !== undefined) { patch.full_name = str(body.full_name); if (!patch.full_name) throw new AppError('F.I.Sh. bo‘sh bo‘lmasligi kerak.'); }
    for (const k of ['phone', 'organization', 'position']) if (body[k] !== undefined) patch[k] = str(body[k]) || null;
    return { user: shapeUser(must(await db.from('mc_users').update(patch).eq('id', user.id).select().single())) };
  }

  if (action === 'start_test' || action === 'start_exam') {
    if (!hasAccess(user)) throw new AppError('Test ishlash uchun administrator ruxsati yoki amaldagi kirish muddati kerak.', 403);

    if (action === 'start_exam') {
      // Tugallanmagan rasmiy imtihon bo'lsa — qayta ochmasdan davom ettiramiz (savollarni qayta tanlab bo'lmaydi).
      const windowMs = (EXAM_MINUTES * 60 + GRACE_SECONDS) * 1000;
      await db.from('mc_attempts').update({ status: 'cancelled' })
        .eq('user_id', user.id).eq('mode', 'official').eq('status', 'in_progress')
        .lt('started_at', new Date(Date.now() - windowMs).toISOString());
      const open = must(await db.from('mc_attempts').select('*').eq('user_id', user.id).eq('mode', 'official')
        .eq('status', 'in_progress').order('started_at', { ascending: false }).limit(1));
      if (open?.length) {
        const at = open[0];
        const qs = must(await db.from('mc_questions').select('*').in('id', at.question_ids));
        const ordered = at.question_ids.map((id) => qs.find((q) => q.id === id)).filter(Boolean);
        const left = Math.max(0, at.duration_minutes * 60 - Math.floor((Date.now() - new Date(at.started_at).getTime()) / 1000));
        return attemptPayload(at, ordered, at.question_points || {}, left);
      }
    }

    let questions, pointsMap = {}, title, mode, duration, testId = null;
    if (action === 'start_test') {
      if (!uuid(body.test_id)) throw new AppError('Test tanlanmagan.');
      const test = must(await db.from('mc_tests').select('*').eq('id', body.test_id).eq('is_published', true).maybeSingle());
      if (!test) throw new AppError('Test topilmadi yoki nashr qilinmagan.', 404);
      questions = must(await db.from('mc_questions').select('*').eq('test_id', test.id).eq('active', true).order('sort_order'));
      for (const q of questions) pointsMap[q.id] = Number(q.points) || 1;
      title = test.title; mode = 'practice'; duration = test.duration_minutes || 0; testId = test.id;
    } else {
      ({ questions, pointsMap } = await buildExam(db));
      title = 'Rasmiy imtihon — 30 savol'; mode = 'official'; duration = EXAM_MINUTES;
    }
    if (!questions.length) throw new AppError('Tanlangan testda savollar mavjud emas.', 409);
    const maxScore = round2(Object.values(pointsMap).reduce((s, p) => s + p, 0));
    const attempt = must(await db.from('mc_attempts').insert({
      user_id: user.id, mode, test_id: testId, test_title: title, question_ids: questions.map((q) => q.id),
      question_points: pointsMap, duration_minutes: duration, max_score: maxScore,
      question_count: questions.length, status: 'in_progress', started_at: nowIso()
    }).select().single());
    return attemptPayload(attempt, questions, pointsMap, duration * 60);
  }

  if (action === 'submit_attempt') {
    if (!uuid(body.attempt_id)) throw new AppError('Urinish aniqlanmadi.');
    const attempt = must(await db.from('mc_attempts').select('*').eq('id', body.attempt_id).eq('user_id', user.id).maybeSingle());
    if (!attempt) throw new AppError('Urinish topilmadi.', 404);
    if (attempt.status !== 'in_progress') throw new AppError('Urinish allaqachon yakunlangan.', 409);

    // Atomik "egallash": ikki marta yuborilsa faqat bittasi o'tadi.
    const claimed = must(await db.from('mc_attempts').update({ status: 'completed', completed_at: nowIso() })
      .eq('id', attempt.id).eq('status', 'in_progress').select('id'));
    if (!claimed?.length) throw new AppError('Urinish allaqachon yakunlangan.', 409);

    try {
      const rawElapsed = Math.max(0, Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000));
      const limit = (attempt.duration_minutes || 0) * 60;
      const timedOut = limit > 0 && rawElapsed > limit + GRACE_SECONDS;
      const answerMap = timedOut ? {} : (body.answers && typeof body.answers === 'object' ? body.answers : {});
      const qs = must(await db.from('mc_questions').select('*').in('id', attempt.question_ids));
      const pm = attempt.question_points || {};
      let score = 0, correct = 0; const rows = [];
      for (const q of qs) {
        const possible = Number(pm[q.id] ?? q.points ?? 1);
        const ans = answerMap[q.id] ?? null;
        const ok = ans !== null && gradeAnswer(q, ans);
        const earned = ok ? possible : 0;
        score += earned; if (ok) correct++;
        rows.push({ attempt_id: attempt.id, question_id: q.id, answer: ans, is_correct: ok, points_awarded: earned, points_possible: possible });
      }
      score = round2(score);
      const percentage = Number(attempt.max_score) ? Math.round((score / Number(attempt.max_score)) * 1000) / 10 : 0;
      const elapsed = limit > 0 ? Math.min(rawElapsed, limit) : rawElapsed;
      must(await db.from('mc_attempt_answers').insert(rows).select('id'));
      must(await db.from('mc_attempts').update({ score, percentage, correct_count: correct, elapsed_seconds: elapsed }).eq('id', attempt.id).select('id'));
      return { score, max_score: Number(attempt.max_score), percentage, correct_count: correct, question_count: attempt.question_ids.length, elapsed_seconds: elapsed, timed_out: timedOut };
    } catch (e) {
      await db.from('mc_attempts').update({ status: 'in_progress', completed_at: null }).eq('id', attempt.id);
      throw e;
    }
  }

  if (action === 'attempt_detail') {
    if (!uuid(body.attempt_id)) throw new AppError('Urinish aniqlanmadi.');
    const at = must(await db.from('mc_attempts').select('*').eq('id', body.attempt_id).eq('user_id', user.id).maybeSingle());
    if (!at) throw new AppError('Urinish topilmadi.', 404);
    const attempt = {
      id: at.id, mode: at.mode, test_title: at.test_title, score: at.score, max_score: at.max_score, percentage: at.percentage,
      correct_count: at.correct_count, question_count: at.question_count, elapsed_seconds: at.elapsed_seconds, completed_at: at.completed_at
    };
    let released = false;
    if (at.mode !== 'official') {
      const s = must(await db.from('mc_settings').select('value').eq('key', 'practice_answers_released').maybeSingle());
      released = s?.value === true;
    }
    if (!released) return { attempt, answers_released: false, review: [] };
    const [answers, qs] = await Promise.all([
      db.from('mc_attempt_answers').select('question_id,answer,is_correct').eq('attempt_id', at.id),
      db.from('mc_questions').select('id,question_text,question_type,options,correct_answer,explanation').in('id', at.question_ids)
    ]);
    const am = must(answers);
    const review = at.question_ids.map((id) => must(qs).find((q) => q.id === id)).filter(Boolean).map((q) => {
      const a = am.find((x) => x.question_id === q.id);
      return { ...q, user_answer: a?.answer ?? null, is_correct: a?.is_correct ?? false };
    });
    return { attempt, answers_released: true, review };
  }

  /* ===== ADMIN ===== */
  if (!action.startsWith('admin_')) throw new AppError('Noma’lum amal.');
  requireAdmin(user);

  if (action === 'admin_data') {
    const [users, books, chapters, tests, cats, qrows, setting] = await Promise.all([
      db.from('mc_users').select('*').order('created_at', { ascending: false }),
      db.from('mc_literature').select('*').order('created_at', { ascending: false }),
      db.from('mc_chapters').select('*').order('sort_order'),
      db.from('mc_tests').select('*').order('created_at', { ascending: false }),
      db.from('mc_competencies').select('*').order('sort_order'),
      db.from('mc_questions').select('test_id,competency_id').eq('active', true).range(0, 19999),
      db.from('mc_settings').select('value').eq('key', 'practice_answers_released').maybeSingle()
    ]);
    const testsList = must(tests); const qr = must(qrows); const catList = must(cats);
    const countByTest = {}; for (const r of qr) countByTest[r.test_id] = (countByTest[r.test_id] || 0) + 1;
    const published = new Set(testsList.filter((t) => t.is_published).map((t) => t.id));
    const pool = BLUEPRINT.map(([code, required]) => {
      const cat = catList.find((c) => c.code === code);
      return { code, title: cat?.title || code, required, available: qr.filter((r) => r.competency_id === cat?.id && published.has(r.test_id)).length };
    });
    return {
      users: must(users), literature: must(books), chapters: must(chapters), competencies: catList,
      tests: testsList.map((t) => ({ ...t, question_count: countByTest[t.id] || 0 })),
      pool, answers_released: setting.data?.value === true
    };
  }

  if (action === 'admin_user_update') {
    if (!uuid(body.user_id)) throw new AppError('Foydalanuvchi aniqlanmadi.');
    const target = must(await db.from('mc_users').select('*').eq('id', body.user_id).maybeSingle());
    if (!target) throw new AppError('Foydalanuvchi topilmadi.', 404);
    const isSuperUser = user.role === 'super_admin';
    if (!isSuperUser && isAdmin(target)) throw new AppError('Administratorlarni faqat super administrator o‘zgartiradi.', 403);
    const patch = {};
    if (body.status !== undefined) {
      if (!['pending', 'approved', 'rejected', 'blocked'].includes(body.status)) throw new AppError('Holat noto‘g‘ri.');
      patch.status = body.status;
    }
    if (body.role !== undefined) {
      if (!isSuperUser) throw new AppError('Rolni faqat super administrator o‘zgartiradi.', 403);
      if (!['super_admin', 'admin', 'manager', 'consultant', 'candidate'].includes(body.role)) throw new AppError('Rol noto‘g‘ri.');
      patch.role = body.role;
    }
    for (const k of ['access_from', 'access_until']) {
      if (body[k] === undefined) continue;
      if (body[k] === null) { patch[k] = null; continue; }
      const d = new Date(body[k]); if (Number.isNaN(d.getTime())) throw new AppError('Sana noto‘g‘ri.');
      patch[k] = d.toISOString();
    }
    for (const k of ['full_name', 'phone', 'organization', 'position']) if (body[k] !== undefined) patch[k] = str(body[k]) || null;
    if (target.id === user.id && (patch.role || (patch.status && patch.status !== 'approved'))) throw new AppError('O‘z rolingiz yoki holatingizni o‘zgartirib bo‘lmaydi.');
    if (!Object.keys(patch).length) throw new AppError('O‘zgartirish ko‘rsatilmagan.');
    return { user: must(await db.from('mc_users').update(patch).eq('id', target.id).select().single()) };
  }

  if (action === 'admin_literature_save') {
    const row = {
      title: str(body.title, 300), author: str(body.author) || null, total_pages: Number(body.total_pages) > 0 ? Math.floor(Number(body.total_pages)) : null,
      description: str(body.description, 2000) || null, competency_id: uuid(body.competency_id) ? body.competency_id : null, active: body.active !== false
    };
    if (!row.title) throw new AppError('Adabiyot nomi kiritilishi shart.');
    const q = uuid(body.id) ? db.from('mc_literature').update(row).eq('id', body.id) : db.from('mc_literature').insert(row);
    return { literature: must(await q.select().single()) };
  }

  if (action === 'admin_chapter_save') {
    const num = Math.floor(Number(body.chapter_number)) || 1;
    const row = { literature_id: body.literature_id, title: str(body.title, 300), chapter_number: num, sort_order: Math.floor(Number(body.sort_order)) || num };
    if (!row.title || !uuid(row.literature_id)) throw new AppError('Adabiyot va bob nomi shart.');
    const q = uuid(body.id) ? db.from('mc_chapters').update(row).eq('id', body.id) : db.from('mc_chapters').insert(row);
    return { chapter: must(await q.select().single()) };
  }

  if (action === 'admin_test_save') {
    const row = {
      title: str(body.title, 300), description: str(body.description, 2000) || null, competency_id: body.competency_id,
      literature_id: uuid(body.literature_id) ? body.literature_id : null, chapter_id: uuid(body.chapter_id) ? body.chapter_id : null,
      mode: 'practice', duration_minutes: Math.max(0, Math.min(300, Math.floor(Number(body.duration_minutes)) || 0)),
      is_published: body.is_published === true
    };
    if (!row.title || !uuid(row.competency_id)) throw new AppError('Test nomi va kompetensiya shart.');
    if (row.is_published && uuid(body.id)) {
      const { count } = await db.from('mc_questions').select('id', { count: 'exact', head: true }).eq('test_id', body.id).eq('active', true);
      if (!count) throw new AppError('Savollari yo‘q testni nashr qilib bo‘lmaydi.', 409);
    }
    const q = uuid(body.id) ? db.from('mc_tests').update(row).eq('id', body.id) : db.from('mc_tests').insert(row);
    return { test: must(await q.select().single()) };
  }

  if (action === 'admin_test_publish') {
    if (!uuid(body.test_id)) throw new AppError('Test aniqlanmadi.');
    const publish = body.published === true;
    if (publish) {
      const { count } = await db.from('mc_questions').select('id', { count: 'exact', head: true }).eq('test_id', body.test_id).eq('active', true);
      if (!count) throw new AppError('Savollari yo‘q testni nashr qilib bo‘lmaydi.', 409);
    }
    return { test: must(await db.from('mc_tests').update({ is_published: publish }).eq('id', body.test_id).select().single()) };
  }

  if (action === 'admin_questions') {
    if (!uuid(body.test_id)) throw new AppError('Test aniqlanmadi.');
    const qs = must(await db.from('mc_questions').select('*').eq('test_id', body.test_id).eq('active', true).order('sort_order'));
    return { questions: qs };
  }

  const loadTest = async (id) => {
    if (!uuid(id)) throw new AppError('Test tanlanmagan.');
    const t = must(await db.from('mc_tests').select('id,competency_id').eq('id', id).maybeSingle());
    if (!t) throw new AppError('Test topilmadi.', 404);
    return t;
  };
  const nextOrder = async (testId) => {
    const { count } = await db.from('mc_questions').select('id', { count: 'exact', head: true }).eq('test_id', testId);
    return (count || 0) + 1;
  };

  if (action === 'admin_question_save') {
    const test = await loadTest(body.test_id);
    const built = buildQuestion(body);
    const row = { ...built, test_id: test.id, competency_id: test.competency_id, sort_order: await nextOrder(test.id), active: true };
    return { question: must(await db.from('mc_questions').insert(row).select('id').single()) };
  }

  if (action === 'admin_question_import') {
    const test = await loadTest(body.test_id);
    const items = Array.isArray(body.questions) ? body.questions : null;
    if (!items || !items.length) throw new AppError('Savollar ro‘yxati bo‘sh yoki JSON massiv emas.');
    if (items.length > 200) throw new AppError('Bir martada 200 tadan ko‘p savol import qilib bo‘lmaydi.');
    let order = await nextOrder(test.id);
    const rows = items.map((it, i) => {
      try { return { ...buildQuestion(it || {}), test_id: test.id, competency_id: test.competency_id, sort_order: order++, active: true }; }
      catch (e) { throw new AppError(`${i + 1}-savol: ${e.message}`); }
    });
    must(await db.from('mc_questions').insert(rows).select('id'));
    return { imported: rows.length };
  }

  if (action === 'admin_question_delete') {
    if (!uuid(body.question_id)) throw new AppError('Savol aniqlanmadi.');
    must(await db.from('mc_questions').update({ active: false }).eq('id', body.question_id).select('id'));
    return { ok: true };
  }

  if (action === 'admin_release_answers') {
    must(await db.from('mc_settings').upsert({ key: 'practice_answers_released', value: body.released === true }).select('key'));
    return { ok: true };
  }

  if (action === 'admin_attempts') {
    const data = must(await db.from('mc_attempts')
      .select('id,mode,test_title,score,max_score,percentage,correct_count,question_count,elapsed_seconds,completed_at,mc_users(full_name,telegram_id)')
      .eq('status', 'completed').order('completed_at', { ascending: false }).limit(300));
    return { attempts: data };
  }

  throw new AppError('Noma’lum amal.');
}

export async function handler(event) {
  // Configuration diagnostics: no credentials or tokens are ever returned.
  if (event.httpMethod === 'GET' && (event.path || '').endsWith('/api')) {
    const config = validateConfig();
    return json(config.ok ? 200 : 503, { service: 'MAKTAB MASLAHATCHISI', ...config });
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST talab qilinadi.' });
  const config = validateConfig();
  if (!config.ok) return json(503, { error: 'Server sozlamalari tekshiruvdan o‘tmadi.', code: config.code, ...(config.missing ? { missing: config.missing } : {}) });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON format xato.' }); }
  const action = String(body.action || '');
  try {
    if (action === 'web_login') {
      requireSameOrigin(event);
      const result = await webAdminLogin(body, supabase());
      const response = json(200, { user: result.user });
      response.headers['set-cookie'] = sessionCookie(result.token);
      return response;
    }
    if (action === 'web_logout') {
      requireSameOrigin(event);
      const response = json(200, { ok: true });
      response.headers['set-cookie'] = expiredSessionCookie;
      return response;
    }
    return json(200, await handleAction(action, body, event, supabase()));
  } catch (e) {
    if (e instanceof AppError) return json(e.status, { error: e.message });
    console.error('api error', action, e);
    if (e?.code === '23503') return json(400, { error: 'Bog‘langan yozuv topilmadi.' });
    if (e?.code === '23505') return json(409, { error: 'Bunday yozuv allaqachon mavjud.' });
    return json(500, { error: 'Serverda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.' });
  }
}
