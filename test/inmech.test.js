/* Purchase INSIDE Mechanical's screen (one address), on the rig in gateway mode – what the live rewrite of Mechanical's
 * vercel.json does (/purchase/… → this project, Mechanical's update-194):
 *   GATEWAY=1 PORTAL=1 bash /home/claude/rig/all.sh     then (after test/api.test.js)
 *   timeout 300 node test/inmech.test.js
 * Checks: Purchase's card on the Portal opens Mechanical's screen with Purchase in the middle; Mechanical's dark menu lists
 * Purchase's pages (from /purchase/menu.json); Ctrl K finds Purchase's Dashboard; Mechanical's Logout signs out of Purchase too.
 * The Portal's module addresses are put back at the end. */
'use strict';
const M = '/home/claude/test/node_modules/';
const chromium = require(M + '@sparticuz/chromium').default || require(M + '@sparticuz/chromium'); const puppeteer = require(M + 'puppeteer-core');
const { execSync } = require('child_process'), path = require('path'), fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));
const G = 'http://127.0.0.1:3030';
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const out = []; let pass = 0, fail = 0; const ok = (n, c, x) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !c ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 400) : '')); };
const sql = (db, q) => execSync('timeout 60 su postgres -c "psql -d ' + db + ' -tA -q"', { input: q }).toString().trim();
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { const v = await fn(); if (v) return v; } catch (e) { /* changing */ } await wait(300); } return null; };
(async () => {
  if (sql('rcl_portal', "select count(*) from access where module = 'purchase'") === '0') { console.log('Run test/api.test.js first.'); process.exit(1); }
  const before = sql('rcl_portal', "select key || '|' || url from modules where key in ('mechanical', 'purchase') order by key");
  sql('rcl_portal', "update modules set url = '" + G + "' where key = 'mechanical'; update modules set url = '" + G + "/purchase' where key = 'purchase'; delete from counters; update users set start_item = null where email = 'sujit@rcl.test';");
  sql('rcl', "delete from web.cache where key like 'F\\_%' or key like 'LG\\_%';");
  sql('rcl_pur', 'delete from pur_sessions;');
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--no-sandbox'], headless: 'shell', protocolTimeout: 120000 });
  const errs = [];
  const app = p => p.frames().find(x => x !== p.mainFrame() && !/\/purchase\//.test(x.url()) && x.parentFrame() === p.mainFrame());
  const pur = p => p.frames().find(x => /\/purchase\/\?embed=1/.test(x.url()));
  try {
    const ctx = await b.createBrowserContext(), p = await ctx.newPage();
    await ctx.overridePermissions(G, ['geolocation']); await p.setGeolocation({ latitude: 19.997453, longitude: 73.789802, accuracy: 20 });      // (Mechanical opens only with the location on)
    p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto(G + '/portal/', { waitUntil: 'load' });
    await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'l_email', { timeout: 20000 });
    await p.type('#l_email', 'sujit@rcl.test'); await p.type('#l_pass', 'Nashik#Road848!'); await p.click('#l_btn');
    await until(() => p.evaluate(() => !document.getElementById('v_home').hidden && document.querySelectorAll('#h_sites a.mod').length));
    const card = await p.evaluate(() => { const a = [...document.querySelectorAll('#h_sites a.mod')].find(x => /module=purchase&site=S1/.test(x.getAttribute('href'))); if (a) { a.click(); return a.textContent.trim(); } return ''; });
    ok('the Portal shows Purchase on his site card', /Purchase/.test(card), card);
    const v1 = await until(async () => { const f = pur(p); if (!f || !app(p)) return null; const s = await f.evaluate(() => document.body.dataset.loaded); return s && { page: s, url: p.url(), crumb: await app(p).evaluate(() => document.getElementById('crumb_mod').textContent) }; }, 60000);
    ok('Purchase\'s card on the Portal: Mechanical\'s screen opens with Purchase\'s Dashboard in the middle (the main address)', !!v1 && v1.page === 'dashboard' && v1.crumb === 'Purchase' && v1.url.startsWith(G + '/') && !/\/purchase\//.test(v1.url), v1);
    const inside = await pur(p).evaluate(() => ({ side: getComputedStyle(document.getElementById('side')).display, top: getComputedStyle(document.querySelector('.topbar')).display, tile: (document.querySelector('#db_body .tile b') || {}).textContent }));
    ok('   inside: no menu or top bar of its own; the Dashboard with his 2 sites', inside.side === 'none' && inside.top === 'none' && inside.tile === '2', inside);
    await wait(800); await p.screenshot({ path: path.join(SHOTS, 'inmech-purchase.png') });
    await app(p).evaluate(() => { const g = document.querySelector('#grp_mods .modgrp[data-mod="purchase"]'); if (g && !g.classList.contains('open')) g.querySelector('.grphead').click(); });
    const menu = await until(() => app(p).evaluate(() => { const L = [...document.querySelectorAll('#grp_mods .modgrp[data-mod="purchase"] .navbtn[data-page]')].map(x => x.textContent.trim()); return L.length ? L : null; }), 15000);
    ok('Mechanical\'s dark menu: Purchase with its page (Dashboard)', (menu || []).join() === 'Dashboard', menu);
    await app(p).evaluate(() => { gsOpen(); const i = document.getElementById('gs_in'); i.value = 'Purchase dashboard'; i.dispatchEvent(new Event('input')); });
    const hit = await until(() => app(p).evaluate(() => { const t = document.getElementById('gs_list').innerText; return /Purchase/i.test(t) && /Dashboard/.test(t) ? t.slice(0, 300) : null; }), 20000);
    ok('Ctrl K (Mechanical\'s search) finds Purchase\'s Dashboard', !!hit, hit || await app(p).evaluate(() => document.getElementById('gs_list').innerText.slice(0, 600)));
    await app(p).evaluate(() => { const c = document.getElementById('gs_close') || null; if (c) c.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    ok('   one sign-in of Purchase for him (the fingerprint)', sql('rcl_pur', "select count(*) from pur_sessions where email = 'sujit@rcl.test'") === '1');
  } catch (e) { ok('the run finished', false, e.stack || String(e)); }
  finally { await b.close(); }
  ok('no script error on any page', errs.length === 0, errs);
  before.split('\n').filter(Boolean).forEach(l => { const [k, u] = l.split('|'); sql('rcl_portal', "update modules set url = '" + u + "' where key = '" + k + "';"); });
  console.log(out.join('\n')); console.log('\nTOTAL ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
