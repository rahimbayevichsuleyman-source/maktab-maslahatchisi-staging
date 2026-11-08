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
      <p class="error" id="login-error" role="alert"></p>
    </form>
  </section>`;
  const error = document.getElementById('login-error');
  error.textContent = message;
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
  try {
    const { user } = await api('web_me');
    await showDashboard(user);
  } catch (e) {
    if (e.status === 401 || e.status === 403) showLogin();
    else showLogin(e.message);
  }
}

start();
