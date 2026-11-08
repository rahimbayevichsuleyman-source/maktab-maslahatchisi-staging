/** Server-only configuration. Never return values of secrets to clients. */
export const requiredNames = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_SESSION_SECRET', 'TELEGRAM_BOT_TOKEN'];
export function missingConfig(env = process.env) {
  return requiredNames.filter((name) => !String(env[name] || '').trim());
}
export function adminIds(env = process.env) {
  return String(env.SUPERADMIN_TELEGRAM_IDS || env.SUPER_ADMIN_TELEGRAM_ID || '')
    .split(',').map((v) => v.trim()).filter((v) => /^\d+$/.test(v));
}
export function validateConfig(env = process.env) {
  const missing = missingConfig(env);
  if (missing.length) return { ok: false, code: 'CONFIG_MISSING', missing };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(env.SUPABASE_URL)))
    return { ok: false, code: 'SUPABASE_URL_INVALID' };
  if (String(env.APP_SESSION_SECRET).length < 32)
    return { ok: false, code: 'SESSION_SECRET_TOO_SHORT' };
  if (!adminIds(env).length)
    return { ok: false, code: 'ADMIN_ID_MISSING' };
  return { ok: true, code: 'CONFIG_OK' };
}
