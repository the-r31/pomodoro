import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.argv[2] || 'playwright');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '1423'], { windowsHide: true, stdio: 'pipe' });
await new Promise((resolve, reject) => { server.stdout.on('data', d => { if (d.toString().includes('ready')) resolve(); }); server.on('error', reject); });
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:1423');
    const fits = async name => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${name} overflows`);
    await fits('home');
    assert.equal(await page.locator('.view-full').evaluate(el => getComputedStyle(el).display), width >= 960 ? 'grid' : 'flex');
    if (width === 390 || width === 1366) await page.screenshot({ path: `tests/responsive-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await fits('settings');
    await page.locator('.settings').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Account', exact: true }).click(); await fits('account');
    await page.getByRole('button', { name: 'Close account', exact: true }).click();
    await page.getByRole('button', { name: /Focus Statistics/ }).click(); await fits('statistics');
    await page.getByRole('button', { name: 'Close statistics', exact: true }).click();
    await page.getByRole('button', { name: /▦ Calendar/ }).click(); await fits('calendar month');
    await page.getByRole('button', { name: 'Week', exact: true }).click(); await fits('calendar week');
    await page.reload();
    await page.getByRole('button', { name: /▤ Planner/ }).click();
    for (const name of ['Lists', 'Matrix', 'Timeline', 'Habits', 'Activity']) {
      await page.getByRole('button', { name, exact: true }).click(); await fits(name);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: home, settings, account, statistics, calendar and all planner views at 320/390/768/1366px');
} finally { await browser?.close(); server.kill(); }
