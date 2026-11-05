// Isolated mock backend: no real emails, users, or cloud data are created.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.argv[2] || 'playwright');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '1422'], { windowsHide: true, stdio: 'pipe' });
await new Promise((resolve, reject) => { server.stdout.on('data', d => { if (d.toString().includes('ready')) resolve(); }); server.on('error', reject); server.on('exit', c => reject(new Error(`Vite exit ${c}`))); });
let browser;
const rows = new Map(); let configured = false; let offline = false;
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const profiles = new Map();
const authCalls = [];
const usedRecovery = new Set();
let rejectRefresh = false;
const user = (id) => ({ id, aud: 'authenticated', role: 'authenticated', email: id === alice ? 'alice@example.test' : 'bob@example.test', app_metadata: { provider: 'email' }, user_metadata: profiles.get(id) || {}, created_at: new Date().toISOString() });
const jwt = id => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
const uid = req => { try { return JSON.parse(Buffer.from(req.headers().authorization.split(' ')[1].split('.')[1], 'base64url')).sub; } catch { return null; } };
async function makePage() {
  const context = await browser.newContext({ viewport: { width: 420, height: 780 } });
  await context.route('https://tbqqyqxnlmsgwjeinxpd.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const reply = (body, status = 200) => route.fulfill({ status, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/token')) {
      if (url.searchParams.get('grant_type') === 'refresh_token' && rejectRefresh) return reply({ code: 'refresh_token_not_found', message: 'Refresh token expired' }, 400);
      const body = req.postDataJSON(), id = body.email === 'bob@example.test' ? bob : alice;
      return reply({ access_token: jwt(id), refresh_token: `refresh-${id}`, token_type: 'bearer', expires_in: 3600, user: user(id) });
    }
    if (url.pathname.endsWith('/recover') || url.pathname.endsWith('/resend')) { authCalls.push(url.pathname); return reply({}); }
    if (url.pathname.endsWith('/verify')) {
      assert.equal(req.postDataJSON().type, 'recovery');
      const token = req.postDataJSON().token_hash;
      if (token === 'expired-token' || usedRecovery.has(token)) return reply({ code: 'otp_expired', message: 'Token expired or already used' }, 403);
      assert.equal(token, 'test-recovery-token'); usedRecovery.add(token);
      return reply({ access_token: jwt(alice), refresh_token: 'recovery-refresh', token_type: 'bearer', expires_in: 3600, user: user(alice) });
    }
    if (url.pathname.endsWith('/user') && req.method() === 'PUT') {
      const body = req.postDataJSON();
      if (body.data) profiles.set(uid(req), body.data);
      if (body.password) authCalls.push('password-updated');
      return reply(user(uid(req)));
    }
    if (url.pathname.endsWith('/signup')) return reply({ user: user(alice), session: null });
    if (url.pathname.endsWith('/logout')) return reply({});
    if (url.pathname.endsWith('/user')) return reply(user(uid(req)));
    if (url.pathname.endsWith('/pomodoro_sync')) {
      if (offline) return route.abort();
      if (!configured) return reply({ code: 'PGRST205', message: 'Table missing' }, 404);
      const id = uid(req); if (!id) return reply({ code: '42501', message: 'Not authorized' }, 403);
      let row = rows.get(id) || null;
      if (req.method() === 'POST') {
        if (row) return reply({ code: '23505', message: 'Duplicate row' }, 409);
        const body = req.postDataJSON(); assert.equal(body.user_id, id);
        row = { user_id: id, revision: 1, data: body.data }; rows.set(id, row);
      }
      if (req.method() === 'PATCH') {
        const expected = Number(url.searchParams.get('revision')?.replace('eq.', ''));
        if (!row || expected !== row.revision) row = null;
        else { row = { ...row, revision: row.revision + 1, data: req.postDataJSON().data }; rows.set(id, row); }
      }
      if (url.searchParams.get('select') === 'revision' && row) row = { revision: row.revision };
      return reply(req.headers().accept?.includes('object') ? row : row ? [row] : []);
    }
    return reply({});
  });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:1422'); return page;
}
const open = async p => { await p.getByRole('button', { name: 'Account', exact: true }).click(); };
const close = async p => { await p.getByRole('button', { name: 'Close account', exact: true }).click(); };
const signIn = async (p, email) => { await open(p); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Password', { exact: true }).fill('test-password-123'); await p.locator('.cloud-panel form').getByRole('button', { name: 'Sign in', exact: true }).click(); await p.getByRole('button', { name: 'Check cloud workspace', exact: true }).waitFor(); };
const addTask = async (p, title) => { await p.getByLabel('New task', { exact: true }).fill(title); await p.getByRole('button', { name: 'Add task', exact: true }).click(); };
const sync = async p => { await p.getByRole('button', { name: 'Sync now', exact: true }).click(); await p.waitForFunction(() => !document.querySelector('.cloud-status')?.textContent?.includes('Syncing')); };
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const account = await makePage(); await open(account);
  await account.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await account.getByLabel('Password', { exact: true }).fill('test-password-123');
  await account.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await account.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
  await account.getByRole('button', { name: 'Resend confirmation', exact: true }).click();
  await account.getByRole('status').filter({ hasText: 'Check your email' }).waitFor();
  assert.ok(authCalls.some(p => p.endsWith('/resend')));
  await account.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await account.getByRole('button', { name: 'Send recovery email', exact: true }).click();
  await account.getByRole('status').filter({ hasText: 'recovery email is on its way' }).waitFor();
  assert.ok(authCalls.some(p => p.endsWith('/recover')));
  await account.getByLabel('Recovery link', { exact: true }).fill('https://tbqqyqxnlmsgwjeinxpd.supabase.co/auth/v1/verify?token=expired-token&type=recovery');
  await account.getByRole('button', { name: 'Verify recovery link', exact: true }).click();
  await account.getByRole('alert').waitFor();
  assert.match(await account.getByRole('alert').textContent(), /expired or was already used/);
  assert.equal(await account.getByLabel('New password', { exact: true }).count(), 0);
  await account.getByLabel('Recovery link', { exact: true }).fill('https://tbqqyqxnlmsgwjeinxpd.supabase.co/auth/v1/verify?token=test-recovery-token&type=recovery');
  await account.getByRole('button', { name: 'Verify recovery link', exact: true }).click();
  await account.getByLabel('New password', { exact: true }).fill('new-password-123');
  await account.getByLabel('Confirm new password', { exact: true }).fill('mismatch-password');
  await account.getByRole('button', { name: 'Update password', exact: true }).click();
  await account.getByRole('alert').filter({ hasText: 'Passwords do not match' }).waitFor();
  assert.ok(!authCalls.includes('password-updated'));
  await account.getByLabel('Confirm new password', { exact: true }).fill('new-password-123');
  await account.getByRole('button', { name: 'Update password', exact: true }).click();
  await account.getByRole('status').filter({ hasText: 'Password updated' }).waitFor();
  assert.ok(authCalls.includes('password-updated'));
  await account.locator('summary').filter({ hasText: /^Profile$/ }).click();
  await account.getByLabel('Display name', { exact: true }).fill('Alice Focus');
  await account.getByRole('button', { name: 'Save profile', exact: true }).click();
  await account.getByRole('heading', { name: 'Alice Focus', exact: true }).waitFor();
  assert.equal(rows.size, 0, 'Profile and recovery must not upload a workspace');
  await account.screenshot({ path: 'tests/account-preview.png', fullPage: false });
  await account.context().close();
  const reused = await makePage(); await open(reused);
  await reused.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await reused.getByLabel('Recovery link', { exact: true }).fill('https://tbqqyqxnlmsgwjeinxpd.supabase.co/auth/v1/verify?token=test-recovery-token&type=recovery');
  await reused.getByRole('button', { name: 'Verify recovery link', exact: true }).click();
  await reused.getByRole('alert').filter({ hasText: 'expired or was already used' }).waitFor();
  assert.equal(await reused.getByLabel('New password', { exact: true }).count(), 0);
  await reused.context().close();
  const p1 = await makePage();
  await addTask(p1, 'Original local');
  await signIn(p1, 'alice@example.test'); assert.equal(rows.size, 0);
  await p1.getByRole('button', { name: 'Check cloud workspace', exact: true }).click();
  await p1.getByRole('alert').filter({ hasText: 'Cloud setup is not finished' }).waitFor();
  configured = true;
  await p1.getByRole('button', { name: 'Check cloud workspace', exact: true }).click();
  await p1.getByRole('button', { name: "Upload this device's workspace", exact: true }).click();
  await p1.getByRole('button', { name: 'Sync now', exact: true }).waitFor(); assert.equal(rows.size, 1);
  await close(p1); await addTask(p1, 'From device one'); await open(p1); await sync(p1);
  assert.match(rows.get(alice).data.values['pomo-workspace'], /From device one/);
  const p2 = await makePage(); await signIn(p2, 'alice@example.test');
  await p2.getByRole('button', { name: 'Check cloud workspace', exact: true }).click();
  await p2.getByRole('button', { name: 'Use cloud workspace', exact: true }).click();
  await p2.getByRole('button', { name: 'Sync now', exact: true }).waitFor(); await close(p2);
  assert.match(await p2.locator('.tasks').textContent(), /From device one/);
  // Make both devices dirty before either pulls the other's changes.
  await addTask(p2, 'Device two pending'); await close(p1); await addTask(p1, 'Device one concurrent'); await open(p1); await sync(p1);
  await open(p2); await sync(p2);
  await p2.getByRole('heading', { name: 'Both devices made changes' }).waitFor();
  await p2.screenshot({ path: 'tests/cloud-conflict-preview.png', fullPage: false });
  await p2.getByRole('button', { name: 'Keep cloud version', exact: true }).click();
  await p2.waitForFunction(() => !!localStorage.getItem('pomo-conflict-backup'));
  assert.match(await p2.evaluate(() => localStorage.getItem('pomo-conflict-backup')), /Device two pending/);
  await p2.locator('summary').filter({ hasText: 'Recover previous conflict copy' }).click();
  await p2.getByRole('button', { name: 'Restore device copy and pause sync', exact: true }).click();
  assert.equal(await p2.evaluate(() => localStorage.getItem('pomo-sync-paused')), '1');
  assert.match(await p2.evaluate(() => localStorage.getItem('pomo-workspace')), /Device two pending/);
  assert.match(await p2.evaluate(id => localStorage.getItem(`pomo-cloud-backup:${id}`), alice), /Device one concurrent/);
  await p2.getByRole('button', { name: 'Resume sync', exact: true }).click();
  await sync(p2);
  await close(p2); await addTask(p2, 'Offline task'); offline = true; await open(p2); await sync(p2);
  await p2.waitForFunction(() => document.querySelector('.cloud-status')?.textContent?.includes('Not synced'));
  offline = false; await sync(p2); assert.match(rows.get(alice).data.values['pomo-workspace'], /Offline task/);
  // Partial focus must survive pause/reset and reach a second device with a paused timer.
  await close(p2);
  await p2.clock.install();
  await p2.getByRole('button', { name: 'Settings', exact: true }).click();
  await p2.getByLabel('Focus (min)', { exact: true }).fill('1');
  await p2.locator('.settings').getByRole('button', { name: 'Close', exact: true }).click();
  await p2.getByRole('button', { name: 'Start', exact: true }).click();
  await p2.clock.runFor(30000);
  await p2.getByRole('button', { name: 'Pause', exact: true }).click();
  await open(p2); await sync(p2);
  let saved = rows.get(alice).data.values;
  assert.ok(Object.values(JSON.parse(saved['pomo-minutes'])).reduce((a,b) => a+b, 0) >= 0.49);
  assert.equal(JSON.parse(saved['pomo-records']).length, 1);
  assert.equal(JSON.parse(saved['pomo-timer-checkpoint']).running, false);
  const p3 = await makePage(); await signIn(p3, 'alice@example.test');
  await p3.getByRole('button', { name: 'Check cloud workspace', exact: true }).click();
  await p3.getByRole('button', { name: 'Use cloud workspace', exact: true }).click();
  await close(p3);
  assert.equal(await p3.locator('.time > span').textContent(), '00:30');
  assert.equal(await p3.getByRole('button', { name: 'Start', exact: true }).count(), 1);
  assert.equal(await p3.evaluate(() => JSON.parse(localStorage.getItem('pomo-records')).length), 1);
  await p3.context().close();
  await close(p2); await p2.getByRole('button', { name: 'Reset', exact: true }).click();
  await p2.getByRole('button', { name: 'Start', exact: true }).click();
  await p2.clock.runFor(61000);
  await open(p2); await sync(p2);
  saved = rows.get(alice).data.values;
  assert.equal(Object.values(JSON.parse(saved['pomo-history'])).reduce((a,b) => a+b, 0), 1);
  assert.equal(JSON.parse(saved['pomo-records']).length, 2);
  assert.ok(Math.abs(Object.values(JSON.parse(saved['pomo-minutes'])).reduce((a,b) => a+b, 0) - 1.5) < 0.02);
  await p2.reload();
  assert.equal(await p2.evaluate(() => JSON.parse(localStorage.getItem('pomo-records')).length), 2);
  await p1.getByRole('button', { name: 'Sign out on this device', exact: true }).click();
  await p1.getByLabel('Email', { exact: true }).waitFor(); await close(p1);
  const guestText = await p1.locator('.tasks').textContent(); assert.match(guestText, /Original local/); assert.doesNotMatch(guestText, /From device one/);
  await signIn(p1, 'bob@example.test'); await p1.getByRole('button', { name: 'Check cloud workspace', exact: true }).click();
  await p1.getByRole('button', { name: 'Start with an empty workspace', exact: true }).click();
  await p1.getByRole('button', { name: 'Sync now', exact: true }).waitFor();
  assert.doesNotMatch(rows.get(bob).data.values['pomo-workspace'], /Original local|Offline task/);
  const expiry = await makePage(); await signIn(expiry, 'alice@example.test');
  await expiry.getByRole('button', { name: 'Use cloud workspace', exact: true }).click();
  await expiry.getByRole('button', { name: 'Pause sync', exact: true }).click(); await close(expiry);
  await addTask(expiry, 'Keep my unsynced work');
  await expiry.evaluate(() => { const auth = JSON.parse(localStorage.getItem('pomo-auth')); auth.expires_at = 1; localStorage.setItem('pomo-auth', JSON.stringify(auth)); });
  rejectRefresh = true; await expiry.reload();
  await expiry.getByLabel('Email', { exact: true }).waitFor();
  assert.equal(await expiry.locator('.tasks').count(), 0, 'Expired session must hide saved tasks');
  assert.match(await expiry.evaluate(() => localStorage.getItem('pomo-workspace')), /Keep my unsynced work/);
  assert.equal(await expiry.getByRole('button', { name: 'Download workspace backup', exact: true }).isDisabled(), true);
  rejectRefresh = false;
  await expiry.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await expiry.getByLabel('Password', { exact: true }).fill('test-password-123');
  await expiry.locator('.cloud-panel form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expiry.getByRole('button', { name: 'Account', exact: true }).waitFor(); await open(expiry);
  await expiry.getByRole('button', { name: 'Resume sync', exact: true }).waitFor();
  await close(expiry); assert.match(await expiry.locator('.tasks').textContent(), /Keep my unsynced work/);
  await open(expiry); await expiry.getByRole('button', { name: 'Sign out on this device', exact: true }).click();
  await expiry.getByLabel('Email', { exact: true }).waitFor(); await close(expiry);
  await signIn(expiry, 'alice@example.test');
  await expiry.getByRole('button', { name: 'Resume saved account copy', exact: true }).click();
  await close(expiry); assert.match(await expiry.locator('.tasks').textContent(), /Keep my unsynced work/);
  await expiry.context().close();
  console.log('PASS: expired/reused recovery, session expiry, unsynced backup restoration, conflict recovery; explicit upload, setup errors, two-device sync, conflicts/backups, offline retry, account isolation and sign-out restore (mock backend)');
} finally { await browser?.close(); server.kill(); }
