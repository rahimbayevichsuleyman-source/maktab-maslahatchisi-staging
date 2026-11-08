import test from 'node:test';
import assert from 'node:assert/strict';
import { adminIds, validateConfig } from '../netlify/lib/config.mjs';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'dummy-server-only-key', APP_SESSION_SECRET: 'a'.repeat(64), TELEGRAM_BOT_TOKEN: 'dummy', SUPER_ADMIN_TELEGRAM_ID: '123456789' };
test('old admin variable works, without leaking secrets', () => {
  assert.deepEqual(adminIds(env), ['123456789']);
  assert.deepEqual(validateConfig(env), { ok: true, code: 'CONFIG_OK' });
});
test('new admin variable works', () => {
  assert.deepEqual(adminIds({ ...env, SUPERADMIN_TELEGRAM_IDS: '123, 456, invalid' }), ['123', '456']);
});
test('missing env names are diagnosed', () => {
  const result = validateConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['SUPABASE_SERVICE_ROLE_KEY']);
});
test('short secret and malformed url are rejected', () => {
  assert.equal(validateConfig({ ...env, APP_SESSION_SECRET: 'short' }).code, 'SESSION_SECRET_TOO_SHORT');
  assert.equal(validateConfig({ ...env, SUPABASE_URL: 'http://bad.test' }).code, 'SUPABASE_URL_INVALID');
});
