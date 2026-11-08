const root = document.getElementById('app');

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

async function showDashboard(user) {
  root.innerHTML = `<header class="topbar"><div>${brand()}</div><div class="identity"><strong id="account-email"></strong><span id="account-role"></span></div></header>
    <section class="card welcome"><h2>Kirish tasdiqlandi</h2><p class="subtle">Hisobingiz administrator paneliga ruxsatga ega.</p>
      <button id="logout-button" type="button">Chiqish</button>
      <div class="stage-note">1-bosqich: mustaqil web kirishi va server tomonidagi rol tekshiruvi. Keyingi bosqichda foydalanuvchilar, adabiyotlar, testlar va savollarni boshqarish oynalari qo‘shiladi.</div>
    </section><section class="metrics" id="metrics" aria-label="Loyiha ko‘rsatkichlari"></section><p class="error" id="dashboard-error" role="alert"></p>`;
  document.getElementById('account-email').textContent = user.email || '';
  document.getElementById('account-role').textContent = user.role === 'super_admin' ? 'Bosh administrator' : 'Administrator';
  document.getElementById('logout-button').addEventListener('click', async () => {
    try { await api('web_logout'); showLogin(); }
    catch (e) { document.getElementById('dashboard-error').textContent = e.message; }
  });
  try {
    const { metrics } = await api('web_dashboard');
    const cards = [
      ['Foydalanuvchilar', metrics.users],
      ['Adabiyotlar', metrics.literature],
      ['Testlar', metrics.tests],
      ['Faol savollar', metrics.questions],
      ['Yakunlangan urinishlar', metrics.completed_attempts]
    ];
    const grid = document.getElementById('metrics');
    for (const [label, value] of cards) grid.append(metric(label, value));
  } catch (e) {
    document.getElementById('dashboard-error').textContent = e.message;
  }
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
