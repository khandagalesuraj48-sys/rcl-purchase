/* Purchase in the browser, on the local rig (never live): the Portal :3010 → Purchase :3050.
 *   Run test/api.test.js first (it puts Purchase in the Portal's modules and gives the access this test uses).
 *   A person signs in on the Portal's page and opens Purchase; the Dashboard with his sites; Change site; a phone; Logout.
 *       timeout 300 node test/browser.test.js      (pictures in test/shots/)
 * Uses the Chromium of the rig (/home/claude/test/node_modules). */
'use strict';
const M = '/home/claude/test/node_modules/';
const chromium = require(M + '@sparticuz/chromium').default || require(M + '@sparticuz/chromium'); const puppeteer = require(M + 'puppeteer-core');
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const P = 'http://127.0.0.1:3010', U = 'http://127.0.0.1:3050';
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const out = [];
const ok = (n, c, x) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !c ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500) : '')); };
const sql = (db, q) => execSync('timeout 60 su postgres -c "psql -d ' + db + ' -tA -q"', { input: q }).toString().trim();
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { const v = await fn(); if (v) return v; } catch (e) { /* changing */ } await wait(300); } return null; };
const PW = 'Nashik#Road848!', VPW = 'Audit#PassView9!x';

(async () => {
  if (sql('rcl_portal', "select count(*) from access where module = 'purchase'") === '0') { console.log('Run test/api.test.js first.'); process.exit(1); }
  sql('rcl_portal', "delete from counters; update users set start_item = null where email in ('sujit@rcl.test', 'view@rcl.test');");
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--no-sandbox'], headless: 'shell', protocolTimeout: 120000 });
  const errs = [];
  async function open(email, pw, view) {
    const ctx = await b.createBrowserContext(), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(email + ': ' + String(e.message).slice(0, 200)));
    await p.setViewport(view || { width: 1440, height: 900 });
    await p.goto(U + '/', { waitUntil: 'load' });
    // not signed in: Purchase sends the browser to the Portal's sign-in
    await until(() => p.url().startsWith(P) && p.evaluate(() => !document.getElementById('v_login').hidden));
    await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'l_email', { timeout: 20000 });
    await p.type('#l_email', email); await p.type('#l_pass', pw); await p.click('#l_btn');
    const where = await until(() => p.url().startsWith(U) ? 'pur' : p.evaluate(() => !document.getElementById('v_home').hidden ? 'home' : ''), 30000);
    if (where === 'home') await p.evaluate(() => { const a = [...document.querySelectorAll('#h_sites a.mod')].find(x => /module=purchase&site=S1/.test(x.getAttribute('href'))); if (a) a.click(); });
    const inP = await until(() => p.url().startsWith(U) && p.evaluate(() => document.body.dataset.loaded === 'dashboard'), 30000);
    return { p, ctx, inP: !!inP, where };
  }
  try {
    // ---- the Purchase Admin of S1 and T2 ----
    const A = await open('sujit@rcl.test', PW);
    ok('sign-in on the Portal → Purchase of S1 opens by itself, signed in (nothing typed in Purchase)', A.inP, A.p.url());
    const d = await A.p.evaluate(() => ({ title: document.getElementById('pg_title').textContent, who: document.getElementById('u_role').textContent, site: document.getElementById('site_name').textContent,
      tile: (document.querySelector('#db_body .tile b') || {}).textContent, rows: [...document.querySelectorAll('#db_body tbody tr')].map(r => r.textContent), menu: [...document.querySelectorAll('#pur_pages .navbtn')].map(x => x.textContent),
      mods: [...document.querySelectorAll('#mods .grphead')].map(x => x.textContent.trim()) }));
    ok('the Dashboard: Purchase Admin · VTR; his two sites, the one open now marked', d.title === 'Dashboard' && /^Purchase Admin · /.test(d.who) && d.tile === '2' && d.rows.length === 2 && d.rows.some(t => /Open now/.test(t)), d);
    ok('   the menu: Purchase – Dashboard; his other modules of the site below it', JSON.stringify(d.menu) === '["Dashboard"]' && d.mods.length >= 1, d);
    await A.p.screenshot({ path: path.join(SHOTS, 'pur_dashboard.png') });
    // Change site: his sites with Purchase
    await A.p.click('#site_chg'); await wait(400);
    const sites = await A.p.evaluate(() => [...document.querySelectorAll('#dlg_btns button')].map(x => x.textContent));
    ok('Change site: his sites with Purchase (and the Portal)', sites.some(t => /– open now/.test(t)) && sites.length === 4 && sites.indexOf('All my modules (Portal)') > -1, sites);
    await A.p.keyboard.press('Escape');
    // ---- a Purchase User of S1, on a phone ----
    const V = await open('view@rcl.test', VPW, { width: 390, height: 844, isMobile: true, hasTouch: true });
    const v = await V.p.evaluate(() => ({ who: document.getElementById('u_role').textContent, tile: (document.querySelector('#db_body .tile b') || {}).textContent, side: getComputedStyle(document.getElementById('side')).transform !== 'none',
      wide: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
    ok('a Purchase User on a phone: his one site; the menu folded away; nothing wider than the phone', V.inP && /^Purchase User/.test(v.who) && v.tile === '1' && v.side && v.wide, v);
    await V.p.screenshot({ path: path.join(SHOTS, 'pur_phone.png') });
    // Logout (asked first) → the Portal, signed out
    const had = Number(sql('rcl_pur', "select count(*) from pur_sessions where email = 'sujit@rcl.test'"));
    await A.p.click('#u_logout'); await wait(300);
    await A.p.evaluate(() => { const x = [...document.querySelectorAll('#dlg_btns button')].find(y => y.textContent === 'Logout'); if (x) x.click(); });
    const outP = await until(() => A.p.url().startsWith(P) && A.p.evaluate(() => !document.getElementById('v_login').hidden), 20000);
    ok('Logout: asked first; then the Portal\'s sign-in (signed out of Purchase and the Portal)', !!outP && Number(sql('rcl_pur', "select count(*) from pur_sessions where email = 'sujit@rcl.test'")) === had - 1, [A.p.url(), had]);
    ok('no error on any page', errs.length === 0, errs);
  } finally { await b.close(); }
  console.log(out.join('\n'));
  console.log('\nTOTAL ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(out.join('\n')); console.error('CRASH', e); process.exit(2); });
