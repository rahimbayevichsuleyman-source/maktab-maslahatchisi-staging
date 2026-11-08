const root = document.getElementById('app');
let currentAdmin = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

async function api(action, fields = {}) {
  let response;
  try {
    response = await fetch('/.netlify/functions/api', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...fields })
    });
  } catch {
    throw new Error('Internet aloqasi yo‘q. Qayta urinib ko‘ring.');
  }
  let data = {};
  try { data = await response.json(); } catch { /* server javobi JSON bo‘lmasligi mumkin */ }
  if (!response.ok) {
    const error = new Error(data.error || 'So‘rov bajarilmadi.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function brand() {
  return '<div class="brand"><div class="brand-mark" aria-hidden="true">MM</div><div><p class="eyebrow">MAKTAB MASLAHATCHISI</p><h1>Administrator paneli</h1></div></div>';
}

function recoveryFromLocation() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get('type') || query.get('type');
  const errorCode = hash.get('error_code') || query.get('error_code');
  const errorText = hash.get('error') || query.get('error');
  const accessToken = hash.get('access_token') || query.get('access_token');
  const hasRecoveryReturn = type === 'recovery' || Boolean(errorCode || errorText);
  if (!hasRecoveryReturn) return null;

  // Recovery tokens belong in the URL fragment only briefly; remove them from history immediately.
  window.history.replaceState(null, '', window.location.pathname);
  if (errorCode || errorText || type !== 'recovery' || !accessToken) {
    return { error: 'Tiklash havolasi yaroqsiz yoki muddati tugagan. Yangi xat so‘rang.' };
  }
  return { accessToken };
}

function showLogin(message = '') {
  root.innerHTML = `<section class="card login-card">
    ${brand()}
    <p class="subtle">Davom etish uchun administrator hisobingiz bilan kiring.</p>
    <form id="login-form" novalidate>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" maxlength="254" required>
      <label for="password">Parol</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button class="submit" id="login-button" type="submit">Xavfsiz kirish</button>
      <button class="text-button forgot-button" id="forgot-password" type="button">Parolni unutdingizmi?</button>
      <p class="error" id="login-error" role="alert"></p>
    </form>
  </section>`;
  const error = document.getElementById('login-error');
  error.textContent = message;
  document.getElementById('forgot-password').addEventListener('click', showRecoveryRequest);
  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('login-button');
    button.disabled = true;
    error.textContent = '';
    try {
      const form = new FormData(event.currentTarget);
      const result = await api('web_login', { email: form.get('email'), password: form.get('password') });
      await showDashboard(result.user);
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
    }
  });
}

function showRecoveryRequest() {
  root.innerHTML = `<section class="card login-card">
    ${brand()}
    <h2 class="form-title">Parolni tiklash</h2>
    <p class="subtle">Administrator hisobingiz emailini kiriting. Tiklash havolasi emailga yuboriladi.</p>
    <form id="recovery-form">
      <label for="recovery-email">Email</label>
      <input id="recovery-email" name="email" type="email" autocomplete="email" maxlength="254" required>
      <button class="submit" id="recovery-button" type="submit">Tiklash xatini yuborish</button>
      <button class="text-button forgot-button" id="back-to-login" type="button">Kirish sahifasiga qaytish</button>
      <p class="error" id="recovery-error" role="alert"></p>
      <p class="success" id="recovery-success" role="status"></p>
    </form>
  </section>`;
  document.getElementById('back-to-login').addEventListener('click', () => showLogin());
  document.getElementById('recovery-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('recovery-button');
    const error = document.getElementById('recovery-error');
    const success = document.getElementById('recovery-success');
    button.disabled = true;
    error.textContent = '';
    success.textContent = '';
    try {
      const form = new FormData(event.currentTarget);
      const result = await api('web_password_recovery', { email: form.get('email') });
      success.textContent = result.message || 'Agar bu email administrator hisobiga bog‘langan bo‘lsa, tiklash xati yuborildi.';
    } catch (e) {
      error.textContent = e.message;
    } finally {
      button.disabled = false;
    }
  });
}

function showPasswordReset(accessToken) {
  root.innerHTML = `<section class="card login-card">
    ${brand()}
    <h2 class="form-title">Yangi parol</h2>
    <p class="subtle">Yangi parol kamida 8 ta belgidan iborat bo‘lsin.</p>
    <form id="reset-form" novalidate>
      <label for="new-password">Yangi parol</label>
      <input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="1024" required>
      <label for="confirm-password">Yangi parolni takrorlang</label>
      <input id="confirm-password" name="confirm_password" type="password" autocomplete="new-password" minlength="8" maxlength="1024" required>
      <button class="submit" id="reset-button" type="submit">Parolni saqlash</button>
      <p class="error" id="reset-error" role="alert"></p>
    </form>
  </section>`;
  const error = document.getElementById('reset-error');
  document.getElementById('reset-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('reset-button');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    const confirmation = String(form.get('confirm_password') || '');
    error.textContent = '';
    if (password.length < 8) { error.textContent = 'Yangi parol kamida 8 ta belgidan iborat bo‘lsin.'; return; }
    if (password !== confirmation) { error.textContent = 'Kiritilgan parollar bir xil emas.'; return; }
    button.disabled = true;
    try {
      await api('web_password_update', { access_token: accessToken, password });
      showLogin('Parolingiz yangilandi. Endi yangi parol bilan kiring.');
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
    }
  });
}

function metric(label, value) {
  const box = document.createElement('section');
  box.className = 'card metric';
  const name = document.createElement('div');
  name.className = 'metric-label';
  name.textContent = label;
  const number = document.createElement('p');
  number.className = 'metric-value';
  number.textContent = String(value ?? 0);
  box.append(name, number);
  return box;
}

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function isoDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function roleLabel(role) {
  return ({ super_admin: 'Bosh administrator', admin: 'Administrator', manager: 'Menejer', consultant: 'Maslahatchi', candidate: 'Nomzod' })[role] || role;
}

function statusLabel(status) {
  return ({ pending: 'Kutilmoqda', approved: 'Tasdiqlangan', rejected: 'Rad etilgan', blocked: 'Bloklangan' })[status] || status;
}

function showDashboard(user) {
  currentAdmin = user;
  root.innerHTML = `<header class="topbar"><div>${brand()}</div><div class="identity"><strong id="account-email"></strong><span id="account-role"></span></div></header>
    <nav class="admin-nav" aria-label="Administrator bo‘limlari">
      <button type="button" class="nav-button active" data-section="overview">Umumiy</button>
      <button type="button" class="nav-button" data-section="users">Foydalanuvchilar</button>
      <button type="button" class="nav-button" data-section="literature">Adabiyotlar</button>
      <button type="button" class="logout-button" id="logout-button">Chiqish</button>
    </nav>
    <main id="section-content" aria-live="polite"></main>`;
  document.getElementById('account-email').textContent = user.email || '';
  document.getElementById('account-role').textContent = roleLabel(user.role);
  document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-section]').forEach((item) => item.classList.toggle('active', item === button));
    if (button.dataset.section === 'users') renderUsers();
    else if (button.dataset.section === 'literature') renderLiterature();
    else renderOverview();
  }));
  document.getElementById('logout-button').addEventListener('click', async () => {
    try { await api('web_logout'); currentAdmin = null; showLogin(); }
    catch (e) { const area = document.getElementById('section-content'); if (area) area.innerHTML = `<p class="error" role="alert">${esc(e.message)}</p>`; }
  });
  renderOverview();
}

async function renderOverview() {
  const area = document.getElementById('section-content');
  if (!area) return;
  area.innerHTML = '<section class="card loading-card">Ma’lumotlar yuklanmoqda…</section>';
  try {
    const { metrics } = await api('web_dashboard');
    const cards = [
      ['Foydalanuvchilar', metrics.users],
      ['Adabiyotlar', metrics.literature],
      ['Testlar', metrics.tests],
      ['Faol savollar', metrics.questions],
      ['Yakunlangan urinishlar', metrics.completed_attempts]
    ];
    area.innerHTML = `<section class="card welcome"><h2>Umumiy ko‘rsatkichlar</h2><p class="subtle">Loyiha ma’lumotlari.</p></section>
      <section class="metrics" id="metrics" aria-label="Loyiha ko‘rsatkichlari"></section>
      <p class="error" id="dashboard-error" role="alert"></p>`;
    const grid = document.getElementById('metrics');
    for (const [label, value] of cards) grid.append(metric(label, value));
  } catch (e) {
    area.innerHTML = `<section class="card welcome"><h2>Umumiy ko‘rsatkichlar</h2><p class="error" role="alert">${esc(e.message)}</p></section>`;
  }
}

function userCard(user) {
  const roleOptions = [
    ['candidate', 'Nomzod'], ['consultant', 'Maslahatchi'], ['manager', 'Menejer'], ['admin', 'Administrator'], ['super_admin', 'Bosh administrator']
  ];
  const statusOptions = [
    ['pending', 'Kutilmoqda'], ['approved', 'Tasdiqlangan'], ['rejected', 'Rad etilgan'], ['blocked', 'Bloklangan']
  ];
  const canEditRoles = currentAdmin?.role === 'super_admin';
  const protectedAdmin = !canEditRoles && ['admin', 'super_admin'].includes(user.role);
  const disabled = protectedAdmin ? 'disabled' : '';
  const roleField = canEditRoles
    ? `<label>Rol<select name="role">${roleOptions.map(([value, label]) => `<option value="${value}" ${user.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`
    : `<div class="readonly-field"><span class="field-name">Rol</span><strong>${esc(roleLabel(user.role))}</strong></div>`;
  const statusField = `<label>Holat<select name="status" ${disabled}>${statusOptions.map(([value, label]) => `<option value="${value}" ${user.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;

  return `<article class="card user-card">
    <header class="user-heading"><div><h3>${esc(user.full_name || 'Ism kiritilmagan')}</h3>
      <p class="muted">Telegram ID: ${esc(user.telegram_id)}${user.username ? ` · @${esc(user.username)}` : ''}</p></div>
      <span class="user-status">${esc(statusLabel(user.status))}</span></header>
    <form data-user-form="${esc(user.id)}" class="user-form">
      <div class="user-fields">
        <label>F.I.Sh.<input name="full_name" maxlength="250" value="${esc(user.full_name || '')}" ${disabled} required></label>
        <label>Telefon<input name="phone" maxlength="250" value="${esc(user.phone || '')}" ${disabled}></label>
        <label>Tashkilot<input name="organization" maxlength="250" value="${esc(user.organization || '')}" ${disabled}></label>
        <label>Lavozim<input name="position" maxlength="250" value="${esc(user.position || '')}" ${disabled}></label>
        ${roleField}
        ${statusField}
        <label>Kirish boshlanishi<input type="datetime-local" name="access_from" value="${localDateTime(user.access_from)}" ${disabled}></label>
        <label>Kirish tugashi<input type="datetime-local" name="access_until" value="${localDateTime(user.access_until)}" ${disabled}></label>
      </div>
      ${protectedAdmin ? '<p class="muted access-note">Administrator hisoblarini faqat bosh administrator o‘zgartira oladi.</p>' : '<p class="muted access-note">Nomzodga testlar ochilishi uchun holatini “Tasdiqlangan” qilib, kirish tugash sanasini belgilang.</p>'}
      <div class="user-actions"><button type="submit" class="small-button" ${disabled}>Saqlash</button><span class="save-message" data-save-message="${esc(user.id)}" role="status"></span></div>
    </form>
  </article>`;
}

async function renderUsers(searchTerm = '') {
  const area = document.getElementById('section-content');
  if (!area) return;
  area.innerHTML = `<section class="card users-panel"><h2>Foydalanuvchilar</h2><p class="subtle">Telegram orqali ro‘yxatdan o‘tgan foydalanuvchilarni qidiring va kirish ruxsatini boshqaring.</p>
    <label class="search-label">Qidirish<input id="user-search" type="search" placeholder="Ism, Telegram ID, telefon yoki tashkilot" value="${esc(searchTerm)}"></label>
    <div id="user-list"><section class="card loading-card">Foydalanuvchilar yuklanmoqda…</section></div>
    <p class="error" id="users-error" role="alert"></p></section>`;

  let users;
  try {
    ({ users } = await api('admin_data'));
  } catch (e) {
    document.getElementById('users-error').textContent = e.message;
    document.getElementById('user-list').innerHTML = '';
    return;
  }

  const list = document.getElementById('user-list');
  const search = document.getElementById('user-search');
  const paint = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = (users || []).filter((u) => [u.full_name, u.telegram_id, u.username, u.phone, u.organization, u.position]
      .some((value) => String(value || '').toLocaleLowerCase().includes(query)));
    list.innerHTML = filtered.length
      ? filtered.map(userCard).join('')
      : '<section class="card empty-state">Mos foydalanuvchi topilmadi.</section>';
    list.querySelectorAll('[data-user-form]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const message = form.querySelector('[data-save-message]');
      const values = new FormData(form);
      const payload = {
        user_id: form.dataset.userForm,
        full_name: values.get('full_name'),
        phone: values.get('phone'),
        organization: values.get('organization'),
        position: values.get('position'),
        status: values.get('status'),
        access_from: isoDateTime(values.get('access_from')),
        access_until: isoDateTime(values.get('access_until'))
      };
      if (currentAdmin?.role === 'super_admin') payload.role = values.get('role');
      button.disabled = true;
      message.textContent = 'Saqlanmoqda…';
      message.classList.remove('save-error');
      try {
        const result = await api('admin_user_update', payload);
        const index = users.findIndex((item) => item.id === form.dataset.userForm);
        if (index >= 0 && result.user) users[index] = result.user;
        if (result.user) {
          const card = form.closest('.user-card');
          const name = card?.querySelector('.user-heading h3');
          const status = card?.querySelector('.user-status');
          if (name) name.textContent = result.user.full_name || 'Ism kiritilmagan';
          if (status) status.textContent = statusLabel(result.user.status);
        }
        message.textContent = 'Saqlandi.';
      } catch (e) {
        message.textContent = e.message;
        message.classList.add('save-error');
      } finally {
        button.disabled = false;
      }
    }));
  };
  search.addEventListener('input', paint);
  paint();
}

async function renderLiterature() {
  const area = document.getElementById('section-content');
  if (!area) return;
  area.innerHTML = '<section class="card loading-card">Adabiyotlar yuklanmoqda…</section>';

  let data;
  try {
    data = await api('admin_data');
  } catch (e) {
    area.innerHTML = `<section class="card welcome"><h2>Adabiyotlar</h2><p class="error" role="alert">${esc(e.message)}</p></section>`;
    return;
  }

  const books = data.literature || [];
  const chapters = data.chapters || [];
  const competencies = data.competencies || [];
  let editingId = null;
  let notice = '';
  let error = '';

  const competencyName = (id) => competencies.find((item) => item.id === id)?.title || 'Kompetensiya tanlanmagan';
  const chapterForm = (book, chapter = null, nextNumber = 1) => `<form class="chapter-row" data-chapter-form data-literature-id="${esc(book.id)}" data-chapter-id="${esc(chapter?.id || '')}">
    <label>Bob raqami<input name="chapter_number" type="number" min="1" max="10000" value="${esc(chapter?.chapter_number ?? nextNumber)}" required></label>
    <label>Bob nomi<input name="title" maxlength="300" value="${esc(chapter?.title || '')}" required></label>
    <button class="small-button" type="submit">Saqlash</button><span class="inline-error" data-form-error role="alert"></span>
  </form>`;

  const paint = () => {
    const editing = books.find((item) => item.id === editingId) || null;
    const editor = `<section class="card literature-editor" id="literature-editor">
      <h3>${editing ? 'Adabiyotni tahrirlash' : 'Yangi adabiyot qo‘shish'}</h3>
      <form id="literature-form" novalidate>
        <div class="user-fields">
          <label>Adabiyot nomi<input name="title" maxlength="300" value="${esc(editing?.title || '')}" required></label>
          <label>Muallif<input name="author" maxlength="250" value="${esc(editing?.author || '')}"></label>
          <label>Sahifalar soni<input name="total_pages" type="number" min="1" max="100000" value="${esc(editing?.total_pages || '')}"></label>
          <label>Kompetensiya<select name="competency_id"><option value="">Tanlanmagan</option>${competencies.map((item) => `<option value="${esc(item.id)}" ${editing?.competency_id === item.id ? 'selected' : ''}>${esc(item.code)} — ${esc(item.title)}</option>`).join('')}</select></label>
          <label class="check-row"><input name="active" type="checkbox" ${editing?.active !== false ? 'checked' : ''}> Foydalanuvchilarga faol ko‘rinsin</label>
        </div>
        <label>Tavsif<textarea name="description" maxlength="2000" rows="3">${esc(editing?.description || '')}</textarea></label>
        <div class="user-actions"><button type="submit" class="small-button">${editing ? 'O‘zgarishlarni saqlash' : 'Adabiyotni saqlash'}</button>${editing ? '<button type="button" class="cancel-button" id="cancel-literature-edit">Bekor qilish</button>' : ''}</div>
        <span class="inline-error" data-form-error role="alert"></span>
      </form>
    </section>`;

    const cards = books.map((book) => {
      const bookChapters = chapters.filter((chapter) => chapter.literature_id === book.id)
        .sort((left, right) => (left.sort_order || left.chapter_number) - (right.sort_order || right.chapter_number));
      const nextNumber = bookChapters.reduce((highest, chapter) => Math.max(highest, Number(chapter.chapter_number) || 0), 0) + 1;
      return `<article class="card literature-card">
        <header class="literature-heading"><div><h3>${esc(book.title)}</h3><p class="muted">${esc(book.author || 'Muallif ko‘rsatilmagan')} · ${book.total_pages ? `${esc(book.total_pages)} bet` : 'Betlar soni ko‘rsatilmagan'} · ${esc(competencyName(book.competency_id))}</p></div>
          <span class="user-status">${book.active ? 'Faol' : 'Yashirilgan'}</span></header>
        ${book.description ? `<p class="literature-description">${esc(book.description)}</p>` : ''}
        <div class="literature-actions"><button type="button" class="cancel-button" data-edit-literature="${esc(book.id)}">Tahrirlash</button></div>
        <section class="chapters-section"><h4>Boblar (${bookChapters.length})</h4>
          ${bookChapters.length ? bookChapters.map((chapter) => chapterForm(book, chapter)).join('') : '<p class="muted">Boblar hali qo‘shilmagan.</p>'}
          <h5>Yangi bob</h5>${chapterForm(book, null, nextNumber)}
        </section>
      </article>`;
    }).join('');

    area.innerHTML = `<section class="card users-panel"><h2>Adabiyotlar</h2><p class="subtle">Adabiyotlar, ularning boblari va foydalanuvchilarga ko‘rinishini boshqaring.</p>
      ${notice ? `<p class="success" role="status">${esc(notice)}</p>` : ''}${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
      ${editor}</section>
      <section class="literature-list" aria-label="Adabiyotlar ro‘yxati">${cards || '<section class="card empty-state">Adabiyotlar hali qo‘shilmagan. Yangi adabiyot qo‘shish uchun yuqoridagi shakldan foydalaning.</section>'}</section>`;

    document.getElementById('literature-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const payload = {
        title: values.get('title'), author: values.get('author'),
        total_pages: values.get('total_pages') ? Number(values.get('total_pages')) : null,
        competency_id: values.get('competency_id') || null,
        description: values.get('description'), active: values.get('active') === 'on'
      };
      if (editing) payload.id = editing.id;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      notice = '';
      error = '';
      try {
        const result = await api('admin_literature_save', payload);
        if (editing) {
          const index = books.findIndex((item) => item.id === editing.id);
          if (index >= 0) books[index] = result.literature;
        } else books.unshift(result.literature);
        editingId = null;
        notice = 'Adabiyot saqlandi.';
        paint();
      } catch (e) {
        error = e.message;
        button.disabled = false;
        form.querySelector('[data-form-error]').textContent = error;
      }
    });

    document.getElementById('cancel-literature-edit')?.addEventListener('click', () => {
      editingId = null;
      notice = '';
      error = '';
      paint();
    });

    area.querySelectorAll('[data-edit-literature]').forEach((button) => button.addEventListener('click', () => {
      editingId = button.dataset.editLiterature;
      notice = '';
      error = '';
      paint();
      document.getElementById('literature-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }));

    area.querySelectorAll('[data-chapter-form]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const payload = {
        literature_id: form.dataset.literatureId,
        chapter_number: Number(values.get('chapter_number')),
        title: values.get('title')
      };
      if (form.dataset.chapterId) payload.id = form.dataset.chapterId;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      error = '';
      notice = '';
      try {
        const result = await api('admin_chapter_save', payload);
        const index = chapters.findIndex((item) => item.id === result.chapter.id);
        if (index >= 0) chapters[index] = result.chapter;
        else chapters.push(result.chapter);
        notice = 'Bob saqlandi.';
        paint();
      } catch (e) {
        error = e.message;
        button.disabled = false;
        form.querySelector('[data-form-error]').textContent = error;
      }
    }));
  };

  paint();
}

async function start() {
  const recovery = recoveryFromLocation();
  if (recovery?.accessToken) { showPasswordReset(recovery.accessToken); return; }
  if (recovery?.error) { showLogin(recovery.error); return; }
  try {
    const { user } = await api('web_me');
    await showDashboard(user);
  } catch (e) {
    if (e.status === 401 || e.status === 403) showLogin();
    else showLogin(e.message);
  }
}

start();
