/* MAKTAB MASLAHATCHISI — Telegram Mini App (frontend) */
const tg = window.Telegram?.WebApp;
try { tg?.ready(); tg?.expand(); tg?.setHeaderColor?.('#101b33'); } catch { /* eski Telegram versiyalari */ }

const root = document.getElementById('app');
const state = { token: localStorage.getItem('mc_token') || '', me: null, data: null, view: 'home', adminTab: 'users', exam: null };
const adminUI = { testId: '', type: 'Y1' };
let timerHandle = null;
let busy = false;

/* ---------- Yordamchilar ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const val = (id) => $(id)?.value ?? '';
const isAdmin = (u) => ['super_admin', 'admin'].includes(u?.role);
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString('uz-UZ') : '—');
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('uz-UZ') : 'Belgilanmagan');
const optText = (o) => (typeof o === 'string' ? o : (o?.text ?? JSON.stringify(o)));
const STATUS = { approved: ['Tasdiqlangan', 'ok'], pending: ['Ko‘rib chiqilmoqda', 'wait'], rejected: ['Rad etilgan', 'bad'], blocked: ['Bloklangan', 'bad'] };
const TYPE_LABEL = { Y1: 'Bitta to‘g‘ri javob', Y2: 'Bir nechta to‘g‘ri javob', Y3: 'Moslashtirish', Y4: 'To‘g‘ri ketma-ketlik' };

function notify(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hide');
  clearTimeout(notify.h); notify.h = setTimeout(() => t.classList.add('hide'), 3800);
}
function ask(msg) {
  return new Promise((resolve) => {
    if (tg?.showConfirm) { try { tg.showConfirm(msg, (ok) => resolve(!!ok)); return; } catch { /* fallthrough */ } }
    resolve(window.confirm(msg));
  });
}
async function guard(fn) {
  if (busy) return;
  busy = true;
  try { return await fn(); } catch (e) { notify(e.message || 'Xatolik yuz berdi.'); } finally { busy = false; }
}

/* ---------- API ---------- */
class ApiError extends Error { constructor(m, status) { super(m); this.status = status; } }
async function request(action, extra = {}, auth = true) {
  let r;
  try {
    r = await fetch('/.netlify/functions/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth && state.token ? { authorization: `Bearer ${state.token}` } : {}) },
      body: JSON.stringify({ action, ...extra })
    });
  } catch { throw new ApiError('Internet aloqasi yo‘q. Qayta urinib ko‘ring.', 0); }
  let j = {}; try { j = await r.json(); } catch { /* bo'sh javob */ }
  if (!r.ok) throw new ApiError(j.error || 'Xatolik yuz berdi.', r.status);
  return j;
}
async function authenticate() {
  if (!tg?.initData) throw new ApiError('Ilovani Telegram bot orqali oching.', 401);
  const j = await request('auth', { initData: tg.initData }, false);
  state.token = j.token; localStorage.setItem('mc_token', j.token); state.me = j.user;
  return j;
}
async function api(action, extra) {
  try { return await request(action, extra); } catch (e) {
    if (e.status === 401 && action !== 'auth') { await authenticate(); return request(action, extra); }
    throw e;
  }
}
async function refresh() { state.data = await api('bootstrap'); state.me = state.data.user; }

/* ---------- Umumiy ko'rinish ---------- */
const statusPill = (u) => { const [t, c] = STATUS[u?.status] || ['Noma’lum', '']; return `<span class="pill ${c}">${t}</span>`; };

function shell(content, { nav = true } = {}) {
  const m = state.me;
  const tabs = [['home', '⌂', 'Bosh sahifa'], ['practice', '▤', 'Testlar'], ['results', '▥', 'Natijalar'], ['profile', '●', 'Profil']];
  if (isAdmin(m)) tabs.push(['admin', '⚙', 'Admin']);
  root.innerHTML = `<div class="wrap"><header class="top"><small>TELEGRAM MINI APP</small><h1>MAKTAB MASLAHATCHISI</h1>
    <p>Bilimingizni sinang. Imtihonga tayyorlaning.</p>
    <div class="userline"><span>${esc(m?.full_name || 'Nomzod')}</span>${statusPill(m)}</div></header>${content}</div>
    ${nav ? `<div class="bottom"><nav>${tabs.map(([v, i, t]) => `<button class="${state.view === v ? 'active' : ''}" data-view="${v}">${i}<br>${t}</button>`).join('')}</nav></div>` : ''}`;
  root.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => go(b.dataset.view); });
}
function go(v) { state.view = v; render(); window.scrollTo(0, 0); }

function accessIssue(u) {
  if (isAdmin(u)) return null;
  if (u.status === 'pending') return ['Kirish ruxsati kutilmoqda', 'Profilingiz administrator tomonidan tasdiqlanishi kerak. Tasdiqlangandan so‘ng testlar ochiladi.'];
  if (u.status === 'rejected') return ['So‘rov rad etilgan', 'Kirish ruxsati berilmagan. Administrator bilan bog‘laning.'];
  if (u.status === 'blocked') return ['Hisob bloklangan', 'Administrator bilan bog‘laning.'];
  if (!u.access_until || new Date(u.access_until) < new Date()) return ['Kirish muddati tugagan', 'Test ishlash uchun administrator kirish muddatini belgilashi yoki uzaytirishi kerak.'];
  if (u.access_from && new Date(u.access_from) > new Date()) return ['Kirish hali boshlanmagan', `Kirish ${fmtDay(u.access_from)} dan boshlanadi.`];
  return null;
}
const accessCard = () => { const i = accessIssue(state.me); return i ? `<div class="card"><h3>${i[0]}</h3><p>${i[1]}</p></div>` : ''; };

function render() {
  if (!state.me) return;
  switch (state.view) {
    case 'exam': return renderExam();
    case 'admin': return renderAdmin();
    case 'profile': return renderProfile();
    case 'results': return renderResults();
    case 'practice': return renderPractice();
    default: return renderHome();
  }
}

/* ---------- Bosh sahifa ---------- */
const tile = (go_, ico, t, s) => `<button class="tile" data-go="${go_}"><span class="ico">${ico}</span><b>${t}</b><span>${s}</span></button>`;
const attemptRow = (a) => `<div class="card row"><div><b>${esc(a.test_title)}</b><div class="muted">${fmtDate(a.completed_at)}</div></div><strong>${a.percentage ?? 0}%</strong></div>`;

function renderHome() {
  const last = (state.data?.attempts || []).slice(0, 3);
  shell(`${accessCard()}<h2 class="section">Tayyorgarlik bo‘limlari</h2><div class="grid">
    ${tile('practice', '📚', 'Adabiyotlar asosida testlar', 'Kitob va bobni tanlab ishlash')}
    ${tile('practice', '🎯', '6 ta kompetensiya', 'Yo‘nalishlar kesimida tayyorgarlik')}
    ${tile('practice', '⚡', 'Erkin test ishlash', 'Istalgan testni tanlang')}
    <button class="tile" id="examtile"><span class="ico">📝</span><b>Rasmiy imtihon rejimi</b><span>30 savol · 80 daqiqa · 78 ball</span></button>
    ${tile('results', '📊', 'Natijalarim', 'Urinishlar va o‘sish dinamikasi')}
    ${tile('profile', '👤', 'Profilim', 'Ruxsat va shaxsiy ma’lumotlar')}</div>
    <h2 class="section">So‘nggi natijalar</h2>${last.map(attemptRow).join('') || '<div class="card muted">Hozircha natijalar mavjud emas.</div>'}`);
  root.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
  $('examtile').onclick = startExam;
}

/* ---------- Testlar ---------- */
function renderPractice() {
  const d = state.data; const cats = d.competencies || [];
  const catName = (id) => cats.find((c) => c.id === id)?.title || '';
  const tests = (d.tests || []).filter((t) => t.mode !== 'official');
  const dur = (t) => (t.duration_minutes ? `${t.duration_minutes} daqiqa` : 'Erkin vaqt');
  const testBtn = (t, label = 'Boshlash') => `<button class="btn" data-test="${t.id}">${label}</button>`;
  shell(`${accessCard()}<h2 class="section">Kompetensiyalar bo‘yicha o‘zlashtirish</h2>
    ${cats.map((c) => {
      const st = (d.stats || []).find((x) => x.competency_id === c.id); const pct = st?.percentage || 0;
      return `<div class="card"><div class="row"><b>${esc(c.title)}</b><span class="pill">${pct}%</span></div>
        <div class="progress"><i style="width:${Math.min(100, pct)}%"></i></div>
        <div class="muted">${esc(c.group_name)} · Rasmiy imtihonda ${c.question_target} ta savol · ${tests.filter((t) => t.competency_id === c.id).length} ta test</div></div>`;
    }).join('')}
    <h2 class="section">Adabiyotlar va boblar</h2>
    ${(d.literature || []).map((book) => {
      const chs = (d.chapters || []).filter((ch) => ch.literature_id === book.id);
      return `<div class="card"><b>${esc(book.title)}</b><div class="muted">${esc(book.author || '')} · ${book.total_pages || '—'} bet</div>
        ${chs.map((ch) => `<div class="tableline"><b>${esc(ch.chapter_number)}. ${esc(ch.title)}</b>
          ${tests.filter((t) => t.chapter_id === ch.id).map((t) => `<div class="row" style="margin-top:8px"><span class="muted">${esc(t.title)} · ${dur(t)}</span>${testBtn(t)}</div>`).join('') || '<div class="tiny">Bu bob uchun test hali joylanmagan.</div>'}</div>`).join('')}
        ${tests.filter((t) => t.literature_id === book.id && !t.chapter_id).map((t) => `<div class="row tableline"><div><b>${esc(t.title)}</b><div class="muted">${dur(t)}</div></div>${testBtn(t)}</div>`).join('')}</div>`;
    }).join('') || '<div class="card muted">Adabiyotlar hali kiritilmagan.</div>'}
    <h2 class="section">Mustaqil kompetensiya testlari</h2>
    ${tests.filter((t) => !t.literature_id).map((t) => `<div class="card"><b>${esc(t.title)}</b>
      <p class="muted">${esc(t.description || '')} ${t.description ? '· ' : ''}${esc(catName(t.competency_id))} · ${dur(t)}</p>${testBtn(t, 'Testni boshlash')}</div>`).join('') || '<div class="card muted">Mustaqil testlar hali joylanmagan.</div>'}`);
  root.querySelectorAll('[data-test]').forEach((b) => { b.onclick = () => startTest(b.dataset.test); });
}

/* ---------- Natijalar ---------- */
function renderResults() {
  shell(`<h2 class="section">Natijalarim</h2>${(state.data?.attempts || []).map((a) => `<div class="card">
    <div class="row"><b>${esc(a.test_title)}</b><strong>${a.percentage ?? 0}%</strong></div>
    <div class="muted">${a.mode === 'official' ? 'Rasmiy imtihon' : 'Mustaqil test'} · ${fmtDate(a.completed_at)}</div>
    <div class="progress"><i style="width:${Math.min(100, a.percentage || 0)}%"></i></div>
    <div class="muted" style="margin-bottom:8px">${a.score ?? 0} / ${a.max_score} ball · ${a.correct_count ?? 0}/${a.question_count} to‘g‘ri</div>
    <button class="btn secondary" data-detail="${a.id}">Tafsilot</button></div>`).join('') || '<div class="card">Test ishlash tarixingiz hozircha bo‘sh.</div>'}`);
  root.querySelectorAll('[data-detail]').forEach((b) => { b.onclick = () => guard(() => detail(b.dataset.detail)); });
}

function fmtAnswer(q, a) {
  if (a === null || a === undefined) return '—';
  const o = q.options;
  try {
    switch (q.question_type) {
      case 'Y1': return optText(o[a]) ?? '—';
      case 'Y2': return a.map((i) => optText(o[i])).join('; ');
      case 'Y3': return Object.keys(a).map((k) => `${o.left[k]} → ${o.right[a[k]]}`).join('; ');
      case 'Y4': return a.map((i, n) => `${n + 1}) ${optText(o[i])}`).join('  ');
      default: break;
    }
  } catch { /* quyidagi zaxira */ }
  return JSON.stringify(a);
}

async function detail(id) {
  const r = await api('attempt_detail', { attempt_id: id });
  const at = r.attempt;
  shell(`<h2 class="section">Test tafsilotlari</h2><div class="card"><b>${esc(at.test_title)}</b><div class="stat">${at.percentage}%</div>
    <p>${at.score}/${at.max_score} ball · ${at.correct_count}/${at.question_count} to‘g‘ri</p></div>
    ${r.answers_released ? r.review.map((q, i) => `<div class="card"><b>${i + 1}. ${esc(q.question_text)}</b>
      <p class="${q.is_correct ? 'ok-text' : 'bad-text'}">${q.is_correct ? 'To‘g‘ri' : 'Noto‘g‘ri'}</p>
      <p class="muted">Sizning javobingiz: ${esc(fmtAnswer(q, q.user_answer))}</p>
      <p>To‘g‘ri javob: ${esc(fmtAnswer(q, q.correct_answer))}</p><p class="muted">${esc(q.explanation || '')}</p></div>`).join('')
      : '<div class="notice">Javoblar va izohlar hozircha yopiq. Administrator e’lon qilgach ko‘rinadi.</div>'}
    <button class="btn secondary" id="backres">Natijalarga qaytish</button>`);
  $('backres').onclick = () => go('results');
}

/* ---------- Profil ---------- */
function renderProfile() {
  const m = state.me; const until = m.access_until ? new Date(m.access_until) : null;
  const days = until ? Math.max(0, Math.ceil((until - Date.now()) / 86400000)) : 0;
  shell(`<h2 class="section">Shaxsiy profil</h2><div class="card">
    <label for="pname">F.I.Sh.</label><input class="field" id="pname" value="${esc(m.full_name)}" maxlength="250">
    <label for="pphone">Telefon</label><input class="field" id="pphone" type="tel" placeholder="+998…" value="${esc(m.phone || '')}" maxlength="50">
    <label for="porg">Tashkilot</label><input class="field" id="porg" value="${esc(m.organization || '')}" maxlength="250">
    <label for="ppos">Lavozim</label><input class="field" id="ppos" value="${esc(m.position || '')}" maxlength="250">
    <button class="btn" id="saveprofile">Saqlash</button></div>
    <div class="card"><div class="row"><b>Hisob holati</b>${statusPill(m)}</div>
    <p class="muted">Rol: ${esc(m.role)}</p><p class="muted">Kirish boshlanishi: ${fmtDay(m.access_from)}</p>
    <p class="muted">Kirish tugashi: ${fmtDay(m.access_until)}</p><div class="stat">${days} kun</div><span class="muted">Qolgan kirish muddati</span></div>`);
  $('saveprofile').onclick = () => guard(async () => {
    const r = await api('profile_update', { full_name: val('pname'), phone: val('pphone'), organization: val('porg'), position: val('ppos') });
    state.me = r.user; notify('Profil saqlandi.');
  });
}

/* ---------- Test ishlash ---------- */
function saveExam() { try { localStorage.setItem('mc_exam', JSON.stringify(state.exam)); } catch { /* xotira to'lgan */ } }
function clearExam() { clearInterval(timerHandle); state.exam = null; try { localStorage.removeItem('mc_exam'); } catch { /* ignore */ } }

function openAttempt(r) {
  state.exam = {
    attempt: r, answers: {}, qIndex: 0, submitting: false, uid: state.me.id,
    deadline: r.remaining_seconds ? Date.now() + r.remaining_seconds * 1000 : 0
  };
  saveExam(); state.view = 'exam'; renderExam(); startTimer(); window.scrollTo(0, 0);
}
function startTimer() {
  clearInterval(timerHandle);
  const ex = state.exam; if (!ex?.deadline) return;
  const tick = () => {
    const left = Math.max(0, Math.ceil((ex.deadline - Date.now()) / 1000));
    const el = $('timer'); if (el) { el.textContent = fmtTime(left); el.classList.toggle('low', left <= 300); }
    if (left <= 0) { clearInterval(timerHandle); submitAttempt(true); }
  };
  timerHandle = setInterval(tick, 1000);
}

const startTest = (id) => guard(async () => openAttempt(await api('start_test', { test_id: id })));
const startExam = () => guard(async () => {
  const i = accessIssue(state.me); if (i) throw new Error(i[1]);
  if (!(await ask('Rasmiy imtihon: 30 savol, 80 daqiqa. Boshlangach vaqt to‘xtamaydi. Boshlaysizmi?'))) return;
  openAttempt(await api('start_exam'));
});

function isAnswered(q) {
  const a = state.exam.answers[q.id];
  switch (q.question_type) {
    case 'Y1': return a !== undefined && a !== null;
    case 'Y2': return Array.isArray(a) && a.length > 0;
    case 'Y3': return !!a && Object.keys(a).length === (q.options?.left?.length || 0);
    case 'Y4': return Array.isArray(a);
    default: return false;
  }
}

function answerHtml(q) {
  const a = state.exam.answers[q.id]; const o = q.options;
  if (q.question_type === 'Y2') {
    return o.map((t, i) => `<label class="option ${(a || []).includes(i) ? 'selected' : ''}"><input type="checkbox" value="${i}" ${(a || []).includes(i) ? 'checked' : ''}><span>${esc(optText(t))}</span></label>`).join('');
  }
  if (q.question_type === 'Y3') {
    const cur = a || {};
    return `<div class="notice" style="margin-bottom:8px">Har bir element uchun mos juftni tanlang.</div>` + o.left.map((l, i) => `<div class="match"><div>${esc(l)}</div>
      <select class="field" data-left="${i}"><option value="">— tanlang —</option>${o.right.map((r, j) => `<option value="${j}" ${cur[i] === j ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>`).join('');
  }
  if (q.question_type === 'Y4') return orderHtml(q);
  return o.map((t, i) => `<label class="option ${a === i ? 'selected' : ''}"><input type="radio" name="opt" value="${i}" ${a === i ? 'checked' : ''}><span>${esc(optText(t))}</span></label>`).join('');
}
function orderHtml(q) {
  const a = state.exam.answers[q.id];
  return `<div class="notice" style="margin-bottom:8px">Elementlarni ▲ ▼ tugmalari bilan to‘g‘ri ketma-ketlikka keltiring.</div>` + a.map((idx, pos) => `<div class="order-row"><span class="num">${pos + 1}</span>
    <span class="grow">${esc(optText(q.options[idx]))}</span>
    <button class="btn secondary small" data-move="${pos}" data-dir="-1" aria-label="Yuqoriga" ${pos === 0 ? 'disabled' : ''}>▲</button>
    <button class="btn secondary small" data-move="${pos}" data-dir="1" aria-label="Pastga" ${pos === a.length - 1 ? 'disabled' : ''}>▼</button></div>`).join('');
}

function renderExam() {
  const ex = state.exam; if (!ex) return go('home');
  const qs = ex.attempt.questions; const q = qs[ex.qIndex];
  if (q.question_type === 'Y4' && !ex.answers[q.id]) { ex.answers[q.id] = q.options.map((_, i) => i); saveExam(); }
  const left = ex.deadline ? Math.max(0, Math.ceil((ex.deadline - Date.now()) / 1000)) : 0;
  const official = ex.attempt.mode === 'official';
  shell(`<div class="row"><span class="pill">${official ? 'Rasmiy imtihon' : 'Mustaqil test'}</span>
    <b class="timer ${ex.deadline && left <= 300 ? 'low' : ''}" id="timer">${ex.deadline ? fmtTime(left) : 'Erkin vaqt'}</b></div>
    <div class="qnav" id="qnav">${qs.map((x, i) => `<button data-q="${i}" class="${i === ex.qIndex ? 'cur' : ''} ${isAnswered(x) ? 'done' : ''}" aria-label="${i + 1}-savol">${i + 1}</button>`).join('')}</div>
    <div class="row muted"><span>Savol ${ex.qIndex + 1} / ${qs.length}</span><span>${esc(q.points)} ball</span></div>
    <div class="progress"><i style="width:${((ex.qIndex + 1) / qs.length) * 100}%"></i></div>
    <div class="card"><div class="muted">${TYPE_LABEL[q.question_type] || q.question_type}</div>
      <div class="question">${esc(q.question_text)}</div><div id="answerbox">${answerHtml(q)}</div>
      <div class="row" style="margin-top:18px"><button class="btn secondary" id="prev" ${ex.qIndex === 0 ? 'disabled' : ''}>Oldingi</button>
      <button class="btn" id="next" ${ex.qIndex === qs.length - 1 ? 'disabled' : ''}>Keyingi</button></div></div>
    <div class="actions"><button class="btn secondary" id="finish">Testni yakunlash</button></div>
    <p class="tiny">Javoblaringiz shu qurilmada saqlanadi. Sahifa yopilsa, davom ettirishingiz mumkin.</p>`, { nav: false });

  const refreshNav = () => root.querySelectorAll('#qnav button').forEach((b, i) => b.classList.toggle('done', isAnswered(qs[i])));
  root.querySelectorAll('#qnav button').forEach((b) => { b.onclick = () => { ex.qIndex = Number(b.dataset.q); saveExam(); renderExam(); window.scrollTo(0, 0); }; });
  $('prev').onclick = () => { ex.qIndex--; saveExam(); renderExam(); window.scrollTo(0, 0); };
  $('next').onclick = () => { ex.qIndex++; saveExam(); renderExam(); window.scrollTo(0, 0); };
  $('finish').onclick = async () => {
    const un = qs.filter((x) => !isAnswered(x)).length;
    if (await ask(un ? `${un} ta savolga javob berilmagan. Baribir yakunlaysizmi?` : 'Testni yakunlaysizmi?')) submitAttempt(false);
  };

  const box = $('answerbox');
  const commit = () => { saveExam(); refreshNav(); };
  if (q.question_type === 'Y1') {
    box.querySelectorAll('input').forEach((el) => { el.onchange = () => {
      ex.answers[q.id] = Number(el.value);
      box.querySelectorAll('.option').forEach((l) => l.classList.toggle('selected', l.querySelector('input').checked)); commit();
    }; });
  } else if (q.question_type === 'Y2') {
    box.querySelectorAll('input').forEach((el) => { el.onchange = () => {
      const picked = [...box.querySelectorAll('input:checked')].map((x) => Number(x.value));
      if (picked.length) ex.answers[q.id] = picked; else delete ex.answers[q.id];
      box.querySelectorAll('.option').forEach((l) => l.classList.toggle('selected', l.querySelector('input').checked)); commit();
    }; });
  } else if (q.question_type === 'Y3') {
    box.querySelectorAll('select').forEach((el) => { el.onchange = () => {
      const cur = { ...(ex.answers[q.id] || {}) };
      if (el.value === '') delete cur[el.dataset.left]; else cur[el.dataset.left] = Number(el.value);
      if (Object.keys(cur).length) ex.answers[q.id] = cur; else delete ex.answers[q.id]; commit();
    }; });
  } else if (q.question_type === 'Y4') {
    const bindOrder = () => box.querySelectorAll('[data-move]').forEach((b) => { b.onclick = () => {
      const a = ex.answers[q.id]; const p = Number(b.dataset.move); const t = p + Number(b.dataset.dir);
      if (t < 0 || t >= a.length) return; [a[p], a[t]] = [a[t], a[p]];
      box.innerHTML = orderHtml(q); bindOrder(); commit();
    }; });
    bindOrder();
  }
}

function renderFinished(r) {
  state.view = 'results';
  shell(`<div class="card" style="text-align:center;padding:28px"><span class="pill ok">Test yakunlandi</span><h2>Natijangiz</h2>
    <div class="stat">${r.percentage}%</div><p><b>${r.score} / ${r.max_score} ball</b></p>
    <p class="muted">${r.correct_count} ta to‘g‘ri javob / ${r.question_count} ta savol</p>
    <p class="muted">Sarflangan vaqt: ${fmtTime(r.elapsed_seconds)}</p>
    ${r.timed_out ? '<div class="notice">Vaqt tugaganidan keyin yuborilgani uchun javoblar hisobga olinmadi.</div>' : ''}
    <div class="notice" style="margin-top:10px">Javoblar va izohlar administrator e’lon qilmaguncha yashirin qoladi (rasmiy imtihonda doim yopiq).</div>
    <button class="btn" id="backhome" style="margin-top:16px">Bosh sahifaga</button></div>`);
  $('backhome').onclick = () => go('home');
}

function renderSubmitError(msg) {
  shell(`<div class="card"><h3>Yuborib bo‘lmadi</h3><p>${esc(msg)}</p>
    <p class="muted">Javoblaringiz saqlangan. Internetni tekshirib, qayta yuboring.</p>
    <button class="btn" id="retry">Qayta yuborish</button></div>`, { nav: false });
  $('retry').onclick = () => submitAttempt(true);
}

async function submitAttempt(auto = false) {
  const ex = state.exam; if (!ex || ex.submitting) return;
  ex.submitting = true; clearInterval(timerHandle);
  try {
    const r = await api('submit_attempt', { attempt_id: ex.attempt.attempt_id, answers: ex.answers });
    clearExam(); try { await refresh(); } catch { /* natija baribir ko'rsatiladi */ }
    renderFinished(r);
  } catch (e) {
    ex.submitting = false;
    if (e.status === 409 || e.status === 404) { clearExam(); try { await refresh(); } catch { /* ignore */ } notify(e.message); go('results'); return; }
    renderSubmitError(e.message || 'Xatolik yuz berdi.');
  }
}

/* ---------- Administrator paneli ---------- */
const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
async function runAdmin(fn, okMsg) {
  await guard(async () => { await fn(); if (okMsg) notify(okMsg); });
  renderAdmin();
}

async function renderAdmin() {
  shell('<div class="loading inline">Yuklanmoqda…</div>');
  let d;
  try { d = await api('admin_data'); } catch (e) { shell(`<div class="card"><h3>Admin panel</h3><p>${esc(e.message)}</p></div>`); return; }
  const tabs = [['users', 'Nomzodlar'], ['books', 'Adabiyotlar'], ['tests', 'Testlar'], ['questions', 'Savollar'], ['attempts', 'Natijalar']];
  let content = `<h2 class="section">Administrator paneli</h2><div class="tabs">${tabs.map(([k, t]) => `<button class="${state.adminTab === k ? 'active' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>`;
  let after = () => {};
  const catOptions = d.competencies.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('');

  if (state.adminTab === 'users') {
    const superU = state.me.role === 'super_admin';
    content += `<div class="card"><b>Nomzodlar va ruxsatlar</b><p class="muted">Ruxsatni tasdiqlang, muddat belgilang yoki bekor qiling.</p>
      <input class="field" id="usersearch" placeholder="Qidirish: ism, username, ID" type="search">
      ${d.users.map((u) => {
    const [st, c] = STATUS[u.status] || [u.status, ''];
    const locked = !superU && isAdmin(u);
    return `<div class="tableline" data-search="${esc(`${u.full_name} ${u.username || ''} ${u.telegram_id}`.toLowerCase())}">
          <div class="row"><b>${esc(u.full_name)}</b><span class="pill ${c}">${st}</span></div>
          <div class="tiny">ID: ${esc(u.telegram_id)} ${u.username ? '· @' + esc(u.username) : ''} · rol: ${esc(u.role)}</div>
          <div class="tiny">${esc([u.organization, u.position, u.phone].filter(Boolean).join(' · '))}</div>
          <div class="tiny">Muddat: ${fmtDay(u.access_from)} — ${fmtDay(u.access_until)}</div>
          ${locked ? '' : `<div class="actions" style="margin-top:8px">
            ${[30, 60, 90].map((n) => `<button class="btn secondary small" data-act="approve" data-days="${n}" data-id="${u.id}">${n} kun</button>`).join('')}
            <button class="btn danger small" data-act="reject" data-id="${u.id}">Rad etish</button>
            <button class="btn danger small" data-act="block" data-id="${u.id}">Bloklash</button></div>`}
          ${superU && u.id !== state.me.id ? `<select class="field" data-role="${u.id}" style="margin-top:8px">${['candidate', 'consultant', 'manager', 'admin', 'super_admin'].map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>` : ''}</div>`;
  }).join('')}</div>`;
    after = () => {
      $('usersearch').oninput = (e) => { const q = e.target.value.trim().toLowerCase(); root.querySelectorAll('[data-search]').forEach((r) => r.classList.toggle('hide', q && !r.dataset.search.includes(q))); };
      root.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
        const act = b.dataset.act; let patch;
        if (act === 'approve') { const days = Number(b.dataset.days); patch = { status: 'approved', access_from: new Date().toISOString(), access_until: new Date(Date.now() + days * 864e5).toISOString() }; }
        else if (act === 'reject') { if (!(await ask('Nomzod rad etilsinmi?'))) return; patch = { status: 'rejected', access_until: null }; }
        else { if (!(await ask('Nomzod bloklansinmi?'))) return; patch = { status: 'blocked', access_until: null }; }
        runAdmin(() => api('admin_user_update', { user_id: b.dataset.id, ...patch }), 'Saqlandi.');
      }; });
      root.querySelectorAll('[data-role]').forEach((s) => { s.onchange = () => runAdmin(() => api('admin_user_update', { user_id: s.dataset.role, role: s.value }), 'Rol yangilandi.'); });
    };
  }

  if (state.adminTab === 'books') {
    content += `<div class="card"><b>Yangi adabiyot</b><label>Nomi</label><input id="booktitle" class="field"><label>Muallif</label><input id="bookauthor" class="field">
      <label>Sahifalar soni</label><input id="bookpages" type="number" min="1" class="field"><label>Izoh</label><textarea id="bookdesc" class="field"></textarea>
      <label>Kompetensiya</label><select id="bookcat" class="field">${catOptions}</select><button class="btn" id="savebook">Adabiyotni saqlash</button></div>
      <div class="card"><b>Adabiyotga bob qo‘shish</b><label>Adabiyot</label><select id="chapterbook" class="field">${d.literature.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join('')}</select>
      <label>Bob raqami</label><input id="chapternum" type="number" min="1" value="1" class="field"><label>Bob nomi</label><input id="chaptertitle" class="field"><button class="btn" id="savechapter">Bobni saqlash</button></div>
      ${d.literature.map((b) => `<div class="card"><b>${esc(b.title)}</b><div class="muted">${esc(b.author || '')} · ${b.total_pages || '—'} bet</div>
        ${d.chapters.filter((c) => c.literature_id === b.id).map((c) => `<div class="tiny">${esc(c.chapter_number)}. ${esc(c.title)}</div>`).join('')}</div>`).join('')}`;
    after = () => {
      on('savebook', () => runAdmin(() => api('admin_literature_save', { title: val('booktitle'), author: val('bookauthor'), total_pages: val('bookpages'), description: val('bookdesc'), competency_id: val('bookcat') }), 'Adabiyot saqlandi.'));
      on('savechapter', () => runAdmin(() => api('admin_chapter_save', { literature_id: val('chapterbook'), chapter_number: val('chapternum'), title: val('chaptertitle') }), 'Bob saqlandi.'));
    };
  }

  if (state.adminTab === 'tests') {
    content += `<div class="card"><b>Rasmiy imtihon tayyorligi</b><p class="muted">Nashr qilingan testlardagi faol savollar soni.</p>
      ${d.pool.map((p) => `<div class="kv"><span>${esc(p.code.toUpperCase())} · ${esc(p.title)}</span><span class="pill ${p.available >= p.required ? 'ok' : 'bad'}">${p.available} / ${p.required}</span></div>`).join('')}</div>
      <div class="card"><b>Test yaratish</b><label>Test nomi</label><input id="testtitle" class="field"><label>Tavsif</label><textarea id="testdesc" class="field"></textarea>
      <label>Kompetensiya</label><select id="testcat" class="field">${catOptions}</select>
      <label>Adabiyot (ixtiyoriy)</label><select id="testbook" class="field"><option value="">Tanlanmagan</option>${d.literature.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join('')}</select>
      <label>Bob (ixtiyoriy)</label><select id="testchapter" class="field"><option value="">Tanlanmagan</option>${d.chapters.map((c) => `<option value="${c.id}">${esc(d.literature.find((b) => b.id === c.literature_id)?.title || '')} — ${esc(c.chapter_number)}. ${esc(c.title)}</option>`).join('')}</select>
      <label>Davomiyligi (daqiqa; 0 — cheklanmagan)</label><input id="testduration" type="number" min="0" max="300" value="0" class="field">
      <p class="muted">Savollar qo‘shilgach, test nashr qilinadi (quyidagi ro‘yxatda).</p><button class="btn" id="savetest">Testni saqlash</button></div>
      ${d.tests.map((t) => `<div class="card"><div class="row"><b>${esc(t.title)}</b><span class="pill ${t.is_published ? 'ok' : 'wait'}">${t.is_published ? 'Nashr qilingan' : 'Qoralama'}</span></div>
        <div class="muted">${t.question_count} ta savol · ${t.duration_minutes || 0} daqiqa</div>
        <button class="btn secondary small" style="margin-top:8px" data-pub="${t.id}" data-to="${!t.is_published}">${t.is_published ? 'Nashrdan olish' : 'Nashr qilish'}</button></div>`).join('')}`;
    after = () => {
      on('savetest', () => runAdmin(() => api('admin_test_save', { title: val('testtitle'), description: val('testdesc'), competency_id: val('testcat'), literature_id: val('testbook') || null, chapter_id: val('testchapter') || null, duration_minutes: val('testduration'), is_published: false }), 'Test saqlandi (qoralama).'));
      root.querySelectorAll('[data-pub]').forEach((b) => { b.onclick = () => runAdmin(() => api('admin_test_publish', { test_id: b.dataset.pub, published: b.dataset.to === 'true' }), 'Saqlandi.'); });
    };
  }

  if (state.adminTab === 'questions') {
    if (!d.tests.length) {
      content += '<div class="card muted">Avval “Testlar” bo‘limida test yarating.</div>';
    } else {
      if (!d.tests.some((t) => t.id === adminUI.testId)) adminUI.testId = d.tests[0].id;
      let qlist = [];
      try { qlist = (await api('admin_questions', { test_id: adminUI.testId })).questions; } catch (e) { notify(e.message); }
      const hints = {
        Y1: ['Variantlar (har biri yangi qatordan)', 'Birinchi variant\nIkkinchi variant\nUchinchi variant\nTo‘rtinchi variant', 'To‘g‘ri variant raqami (1 dan): masalan 2'],
        Y2: ['Variantlar (har biri yangi qatordan)', 'Birinchi variant\nIkkinchi variant\nUchinchi variant\nTo‘rtinchi variant', 'To‘g‘ri variantlar raqami (1 dan), vergul bilan: masalan 1,3'],
        Y3: ['Juftliklar: “Element => Juft” (har biri yangi qatordan)', 'Element A => Juft 1\nElement B => Juft 2\nElement C => Juft 3', ''],
        Y4: ['Elementlar TO‘G‘RI tartibda (nomzodga aralashtirib ko‘rsatiladi)', '1-qadam\n2-qadam\n3-qadam\n4-qadam', '']
      };
      const [lbl, ph, corrLbl] = hints[adminUI.type];
      content += `<div class="card"><b>Savol qo‘shish</b>
        <label>Test</label><select id="qtest" class="field">${d.tests.map((t) => `<option value="${t.id}" ${t.id === adminUI.testId ? 'selected' : ''}>${esc(t.title)} (${t.question_count})</option>`).join('')}</select>
        <label>Savol turi</label><select id="qtype" class="field">${['Y1', 'Y2', 'Y3', 'Y4'].map((t) => `<option value="${t}" ${t === adminUI.type ? 'selected' : ''}>${t} — ${TYPE_LABEL[t]}</option>`).join('')}</select>
        <label>Savol matni</label><textarea id="qtext" class="field" rows="4"></textarea>
        <label id="qoptlabel">${lbl}</label><textarea id="qopts" class="field" rows="5" placeholder="${esc(ph)}"></textarea>
        <div id="qcorrwrap" class="${corrLbl ? '' : 'hide'}"><label id="qcorrlabel">${esc(corrLbl)}</label><input id="qcorrect" class="field"></div>
        <label>Izoh (ixtiyoriy)</label><textarea id="qexplain" class="field"></textarea>
        <label>Manba sahifasi (boshlanishi — tugashi)</label><div class="row"><input id="qpage1" type="number" min="1" placeholder="Boshlanish" class="field"><input id="qpage2" type="number" min="1" placeholder="Tugash" class="field"></div>
        <button class="btn" id="savequestion">Savolni saqlash</button></div>
        <div class="card"><b>JSON orqali ommaviy import</b><p class="muted">Tanlangan testga bir nechta savolni birdan qo‘shing (200 tagacha). Maydonlar: type, text, options, correct, explanation, page_start, page_end.</p>
        <textarea id="qimport" class="field" rows="6" placeholder='[{"type":"Y1","text":"Savol?","options":["A","B","C","D"],"correct":2,"explanation":"…","page_start":10,"page_end":11}]'></textarea>
        <button class="btn secondary" id="importquestions">Import qilish</button></div>
        <h2 class="section">Testdagi savollar (${qlist.length})</h2>
        ${qlist.map((q, i) => `<div class="card"><div class="row"><b>${i + 1}. ${esc(q.question_text.slice(0, 140))}</b><span class="pill">${esc(q.question_type)}</span></div>
          <div class="tiny">To‘g‘ri: ${esc(fmtAnswer(q, q.correct_answer))}</div>
          ${q.source_page_start ? `<div class="tiny">Manba: ${q.source_page_start}${q.source_page_end ? '–' + q.source_page_end : ''}-bet</div>` : ''}
          <button class="btn danger small" style="margin-top:8px" data-delq="${q.id}">O‘chirish</button></div>`).join('') || '<div class="card muted">Bu testda savollar yo‘q.</div>'}`;
      after = () => {
        $('qtest').onchange = (e) => { adminUI.testId = e.target.value; renderAdmin(); };
        $('qtype').onchange = (e) => { adminUI.type = e.target.value; const [l, p, c] = hints[adminUI.type];
          $('qoptlabel').textContent = l; $('qopts').placeholder = p; $('qcorrlabel').textContent = c; $('qcorrwrap').classList.toggle('hide', !c); };
        on('savequestion', () => runAdmin(() => api('admin_question_save', {
          test_id: val('qtest'), question_type: val('qtype'), question_text: val('qtext'), options: val('qopts'), correct: val('qcorrect'),
          explanation: val('qexplain'), source_page_start: val('qpage1') || null, source_page_end: val('qpage2') || null
        }), 'Savol saqlandi.'));
        on('importquestions', () => runAdmin(async () => {
          let items; try { items = JSON.parse(val('qimport')); } catch { throw new Error('JSON format xato.'); }
          const r = await api('admin_question_import', { test_id: val('qtest'), questions: items }); notify(`${r.imported} ta savol qo‘shildi.`);
        }));
        root.querySelectorAll('[data-delq]').forEach((b) => { b.onclick = async () => { if (await ask('Savol o‘chirilsinmi?')) runAdmin(() => api('admin_question_delete', { question_id: b.dataset.delq }), 'O‘chirildi.'); }; });
      };
    }
  }

  if (state.adminTab === 'attempts') {
    let a = { attempts: [] };
    try { a = await api('admin_attempts'); } catch (e) { notify(e.message); }
    content += `<div class="card"><b>Javob kalitlarini e’lon qilish</b><p class="muted">Mustaqil testlar uchun javob va izohlarni ko‘rsatadi. Rasmiy imtihon javoblari doim yopiq.</p>
      <p>Holat: <span class="pill ${d.answers_released ? 'ok' : 'wait'}">${d.answers_released ? 'E’lon qilingan' : 'Yashirin'}</span></p>
      <button class="btn secondary" id="releaseon">E’lon qilish</button> <button class="btn danger" id="releaseoff">Yashirish</button></div>
      <div class="card"><b>Nomzodlar natijalari</b>${a.attempts.map((x) => `<div class="tableline"><b>${esc(x.mc_users?.full_name || 'Nomzod')}</b>
        <div class="muted">${esc(x.test_title)} · ${x.score ?? 0}/${x.max_score} (${x.percentage ?? 0}%) · ${fmtDate(x.completed_at)}</div></div>`).join('') || '<div class="muted">Natijalar yo‘q.</div>'}</div>`;
    after = () => {
      on('releaseon', () => runAdmin(() => api('admin_release_answers', { released: true }), 'Javoblar e’lon qilindi.'));
      on('releaseoff', () => runAdmin(() => api('admin_release_answers', { released: false }), 'Javoblar yashirildi.'));
    };
  }

  shell(content);
  root.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.adminTab = b.dataset.tab; renderAdmin(); }; });
  after();
}

/* ---------- Ishga tushirish ---------- */
async function init() {
  try {
    if (!tg?.initData) {
      root.innerHTML = '<div class="wrap"><div class="card"><h2>Telegram orqali kiring</h2><p>Ushbu ilovani bot ichidagi “Mini ilovani ochish” tugmasi orqali ishga tushiring. Brauzerda bevosita ochish xavfsizlik sababli qo‘llab-quvvatlanmaydi.</p></div></div>';
      return;
    }
    await authenticate();
    await refresh();
    // Yakunlanmagan urinishni tiklash
    try {
      const s = JSON.parse(localStorage.getItem('mc_exam') || 'null');
      if (s && s.uid === state.me.id && s.attempt?.questions?.length) {
        state.exam = { ...s, submitting: false }; state.view = 'exam';
        if (state.exam.deadline && state.exam.deadline <= Date.now()) { render(); submitAttempt(true); return; }
        render(); startTimer(); return;
      }
    } catch { try { localStorage.removeItem('mc_exam'); } catch { /* ignore */ } }
    render();
  } catch (e) {
    root.innerHTML = `<div class="wrap"><div class="card"><h3>Kirishda xatolik</h3><p>${esc(e.message)}</p><button class="btn" id="reload">Qayta urinish</button></div></div>`;
    $('reload').onclick = () => location.reload();
  }
}
init();
