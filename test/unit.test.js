/* Unit tests – no database needed:   timeout 120 node --test test/unit.test.js
 * The Portal's ticket (signature, for whom, its time), the sign-in, the page's script and menu, the database step (only adds,
 * the server only), the Preview guard, the settings files, no secret in any file. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

// a Portal of the test: its own key pair, its jwks and its tickets (ES256, as the Portal's lib/keys.js)
function portal() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'ES256', use: 'sig' });
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sign = (claims, key) => { const h = b64({ alg: 'ES256', kid: 'k1', typ: 'JWT' }), p = b64(claims);
    return h + '.' + p + '.' + crypto.sign('sha256', Buffer.from(h + '.' + p), { key: key || privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url'); };
  return { jwk, sign };
}
async function withPortal(fn) {
  const P = portal(), f0 = global.fetch, env = process.env.PORTAL_URL;
  process.env.PORTAL_URL = 'https://portal.test';
  global.fetch = async url => /\/api\/jwks$/.test(String(url)) ? new Response(JSON.stringify({ keys: [P.jwk] }), { status: 200 }) : new Response('{}', { status: 404 });
  delete require.cache[require.resolve('../lib/portal')];
  try { await fn(require('../lib/portal'), P); }
  finally { global.fetch = f0; if (env === undefined) delete process.env.PORTAL_URL; else process.env.PORTAL_URL = env; delete require.cache[require.resolve('../lib/portal')]; }
}
const claims = (o) => { const now = Math.floor(Date.now() / 1000);
  return Object.assign({ iss: 'https://portal.test', aud: 'purchase', sub: 'Asha@RCL.test', name: 'Asha', site: 'S1', siteName: 'VTR', role: 'user',
    mods: [{ key: 'mechanical', name: 'Mechanical', url: 'https://erp.test' }, { key: 'purchase', name: 'Purchase', url: 'https://erp.test/purchase' }],
    sites: [{ code: 'S1', name: 'VTR' }, { code: 'T2', name: '18B' }], iat: now, exp: now + 60, jti: crypto.randomBytes(16).toString('hex') }, o || {}); };

test('the Portal\'s ticket: only one made for Purchase, signed by the Portal, in its minute – every site where he has Purchase', async () => {
  await withPortal(async (portalLib, P) => {
    const c = await portalLib.verify(P.sign(claims()));
    assert.deepStrictEqual([c.email, c.site, c.role, c.sites.map(s => s.code)], ['asha@rcl.test', 'S1', 'user', ['S1', 'T2']]);
    assert.strictEqual((await portalLib.verify(P.sign(claims({ role: 'admin', super: true })))).role, 'super', 'the Super Admin');
    await assert.rejects(portalLib.verify(P.sign(claims({ aud: 'engineering' }))), /made for another module/);
    await assert.rejects(portalLib.verify(P.sign(claims({ aud: 'store' }))), /made for another module/);
    await assert.rejects(portalLib.verify(P.sign(claims({ iss: 'https://other.test' }))), /made by another Portal/);
    const old = Math.floor(Date.now() / 1000) - 600;
    await assert.rejects(portalLib.verify(P.sign(claims({ iat: old, exp: old + 60 }))), /ran out/);
    const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    await assert.rejects(portalLib.verify(P.sign(claims(), other)), /signature does not match/);
    await assert.rejects(portalLib.verify(P.sign(claims({ role: 'owner' }))), /no proper role/);
    await assert.rejects(portalLib.verify('not.a.ticket!'), /not a ticket/);
    assert.strictEqual(portalLib.AUD, 'purchase');
  });
});

test('the sign-in: its own cookie (rcl_pur), 15 minutes, a ticket used once, the people of each site', () => {
  const ses = fs.readFileSync(path.join(ROOT, 'lib/session.js'), 'utf8'), sso = fs.readFileSync(path.join(ROOT, 'api/sso.js'), 'utf8');
  assert.ok(/const COOKIE = 'rcl_pur', MAX_MS = 15 \* 60 \* 1000;/.test(ses));
  assert.ok(/HttpOnly; SameSite=Lax/.test(ses) && /fp\(token\)/.test(ses), 'only a fingerprint is kept');
  assert.ok(/db\('POST', 'pur_tickets'/.test(sso) && /e\.code === 'duplicate'/.test(sso), 'a ticket once');
  assert.ok(/pur_people\?on_conflict=site,email/.test(sso));
  ['api', 'lib'].forEach(d => fs.readdirSync(path.join(ROOT, d)).forEach(f => assert.ok(!/eng_|rcl_eng|'engineering'/.test(fs.readFileSync(path.join(ROOT, d, f), 'utf8')), d + '/' + f + ': nothing of Engineering left')));
});

test('the page: its script parses; its pages are the menu\'s pages; it opens Purchase on the Portal and inside Mechanical\'s screen', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), js = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new Function(js));
  const keys = Object.keys(eval('(' + /const PAGES = (\{[^}]*\})/.exec(js)[1] + ')'));
  const m = require('../api/menu.js');
  assert.deepStrictEqual(keys, m.PAGES.map(p => p.key));
  keys.forEach(k => assert.ok(html.indexOf('id="pg_' + k + '"') > -1, 'a section for ' + k));
  // (09-11-2026, Purchase Phase 1) a Purchase User: every page but Waiting for my approval and Settings; a Purchase Admin: but Settings
  const ALL = ['dashboard', 'inbox', 'rfq', 'quotes', 'cs', 'approve', 'vendors', 'settings'];
  assert.deepStrictEqual(m.PAGES.filter(p => m.mayOpen(p.who, 'user')).map(p => p.key), ALL.filter(k => k !== 'approve' && k !== 'settings'), 'user');
  assert.deepStrictEqual(m.PAGES.filter(p => m.mayOpen(p.who, 'admin')).map(p => p.key), ALL.filter(k => k !== 'settings'), 'admin');
  assert.deepStrictEqual(m.PAGES.filter(p => m.mayOpen(p.who, 'super')).map(p => p.key), ALL, 'super');
  assert.deepStrictEqual(eval('(' + /const WHO = (\{[^}]*\})/.exec(js)[1] + ')'), Object.fromEntries(m.PAGES.map(p => [p.key, p.who])), 'the page opens a page for the same people as the menu');
  assert.ok(/module=purchase/.test(js) && !/module=engineering|module=store/.test(js));
  assert.ok(/'&page=purchase__'/.test(js), 'inside Mechanical\'s screen: its page key');
  assert.ok(/window\.rclModule = \{\n    key: 'purchase'/.test(js));
});

test('database step 1: only adds, every table for the server only, the people / settings / activity carry their site', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sql/pur_step1_base.sql'), 'utf8'), body = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  const acts = body.split('\n').filter(l => !/\bgrant select, insert, update, delete on\b/.test(l)).join('\n');      // (the server's own rights)
  assert.ok(!/\bdrop\b|\btruncate\b|\bdelete\b|\bupdate\b|\binsert\b|\balter\s+table\s+public\.\w+\s+(drop|alter)/i.test(acts), 'only adds');
  const tables = ['pur_people', 'pur_settings', 'pur_numbers', 'pur_sessions', 'pur_tickets', 'pur_activity'];
  tables.forEach(t => assert.ok(new RegExp('create table if not exists public\\.' + t + ' ').test(body), t));
  assert.ok(new RegExp("foreach t in array array\\[" + tables.map(t => "'" + t + "'").join(', ') + "\\] loop").test(body), 'row level security on every table');
  assert.ok(/revoke all on public\.%I from public, anon, authenticated/.test(body));
  ['pur_people', 'pur_settings', 'pur_activity', 'pur_sessions'].forEach(t => assert.ok(new RegExp('public\\.' + t + ' \\(\\s*(id_hash text primary key, )?site text not null|public\\.' + t + ' \\(\\s*id bigserial primary key, at timestamptz not null default now\\(\\), site text not null').test(body), t + ' carries its site'));
  assert.ok(/' of 6' as done;/.test(body));
  // the server names the step when the tables are missing
  assert.ok(/sql\/pur_step1_base\.sql once in the rcl-purchase Supabase/.test(fs.readFileSync(path.join(ROOT, 'lib/db.js'), 'utf8')));
});

test('a Preview works only with the database marked as the TEST one (as every module); live asks nothing', async () => {
  const P = require('../lib/preview'), { db } = require('../lib/db');
  const env = { VERCEL_ENV: process.env.VERCEL_ENV, VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF, RCL_CHANNEL: process.env.RCL_CHANNEL, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY }, f0 = global.fetch;
  const asked = []; let marked = false;
  global.fetch = async (url) => { asked.push(String(url));
    if (/app_settings\?id=eq\.THIS_IS_A_TEST_DATABASE/.test(url)) return marked ? new Response(JSON.stringify([{ value: 'yes' }]), { status: 200 }) : new Response('{"code":"PGRST205","message":"Could not find the table"}', { status: 404 });
    return new Response(JSON.stringify([{ site: 'S1' }]), { status: 200 }); };
  try {
    process.env.SUPABASE_URL = 'http://db.test'; process.env.SUPABASE_SECRET_KEY = 'k';
    process.env.VERCEL_ENV = 'production'; P._forget(); asked.length = 0;
    assert.deepStrictEqual(await db('GET', 'pur_people?select=site'), [{ site: 'S1' }]); assert.strictEqual(asked.length, 1);
    process.env.VERCEL_ENV = 'preview'; P._forget(); asked.length = 0;
    await assert.rejects(db('GET', 'pur_people?select=site'), e => e.status === 503 && /This is a Preview/.test(e.message));
    await assert.rejects(db('POST', 'pur_activity', [{ x: 1 }]), e => e.status === 503);
    assert.ok(!asked.some(u => /pur_people|pur_activity/.test(u)), 'nothing read or written');
    marked = true; P._forget(); asked.length = 0;
    assert.deepStrictEqual(await db('GET', 'pur_people?select=site'), [{ site: 'S1' }]);
    // (02-11-2026) the BETA copy – branch "beta" AND RCL_CHANNEL = beta (Vercel, that branch only): the live data, no mark asked;
    // one of them missing, or live: as before
    marked = false; process.env.VERCEL_GIT_COMMIT_REF = 'beta'; process.env.RCL_CHANNEL = 'beta'; P._forget(); asked.length = 0;
    assert.strictEqual(P.isBeta(), true); assert.deepStrictEqual(P.band(), { beta: true });
    assert.deepStrictEqual(await db('GET', 'pur_people?select=site'), [{ site: 'S1' }]); assert.strictEqual(asked.length, 1, 'the beta copy asks no mark');
    delete process.env.RCL_CHANNEL; P._forget(); asked.length = 0;
    assert.strictEqual(P.isBeta(), false); assert.deepStrictEqual(P.band(), { preview: true });
    await assert.rejects(db('GET', 'pur_people?select=site'), e => e.status === 503 && /This is a Preview/.test(e.message));
    process.env.RCL_CHANNEL = 'beta'; process.env.VERCEL_GIT_COMMIT_REF = 'staging'; assert.strictEqual(P.isBeta(), false, 'another branch');
    process.env.VERCEL_ENV = 'production'; process.env.VERCEL_GIT_COMMIT_REF = 'beta'; assert.strictEqual(P.isBeta(), false, 'live'); assert.deepStrictEqual(P.band(), {});
    // the page: the beta band or the TEST band, as the server says
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    assert.ok(/if \(j\.beta\) previewBand\(true\); else if \(j\.preview \|\| \/\^This is a Preview\/\.test\(String\(j\.error \|\| ''\)\)\) previewBand\(\);/.test(html) && /id = 'rcl_preview_band'/.test(html));
    assert.ok(html.indexOf("'BETA – the new version for testers · the data is LIVE'") > -1 && html.indexOf("'TEST copy (Preview) – the staging database · nothing here is live'") > -1);
    ['me.js', 'sso.js'].forEach(f => assert.ok(/\.\.\.band\(\)/.test(fs.readFileSync(path.join(ROOT, 'api', f), 'utf8')), f));
  } finally { global.fetch = f0; Object.keys(env).forEach(k => { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }); P._forget(); }
});

test('settings files; no secret in any file', () => {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.deepStrictEqual(v.rewrites, [{ source: '/menu.json', destination: '/api/menu' }]);
  assert.deepStrictEqual(v.regions, ['bom1']);
  assert.ok(!fs.existsSync(path.join(ROOT, 'public/menu.json')), 'no static menu.json (it would hide the per-person menu)');
  const files = []; (function walk(d) { fs.readdirSync(d).forEach(f => { if (['.git', 'node_modules', 'shots'].indexOf(f) > -1) return; const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); }); })(ROOT);
  files.filter(f => /\.(js|json|html|sql|md)$/.test(f) && !/test[\\/]/.test(f)).forEach(f => { const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/sb_secret_[A-Za-z0-9]{10,}|sb_publishable_[A-Za-z0-9]{10,}|eyJhbGciOi[A-Za-z0-9_-]{20,}|service_role\s*[:=]\s*['"][^'"]{20,}/.test(t), 'no key in ' + path.relative(ROOT, f)); });
});

test('the backup export (Mechanical update-195): only with the secret; every site (Purchase\'s own Sheet); only the listed columns; never the sign-ins or tickets; "since" for Sheet 2', async () => {
  const E = require('../api/backup-export.js');
  const env = { BACKUP_EXPORT_SECRET: process.env.BACKUP_EXPORT_SECRET, VERCEL_ENV: process.env.VERCEL_ENV, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY }, f0 = global.fetch;
  const asked = [];
  global.fetch = async (url) => { const u = String(url); asked.push(u);
    if (/\/rest\/v1\/$/.test(u)) return new Response(JSON.stringify({ definitions: { pur_people: { properties: { site: {}, email: {}, name: {}, role: {}, first_seen: {}, last_seen: {}, later_col: {} } },
      pur_activity: { properties: { id: {}, at: {}, site: {}, email: {}, action: {}, target: {}, detail: {} } }, pur_sessions: { properties: { id_hash: {}, site: {} } }, pur_tickets: { properties: { jti: {} } } } }), { status: 200 });
    if (/\?select=site,email,name/.test(u) || /\?select=id,at,site/.test(u)) return new Response(JSON.stringify([{ site: 'S1', email: 'a@rcl.test' }]), { status: 200 });
    return new Response('[]', { status: 200, headers: { 'content-range': '*/3' } }); };
  const call = async (body, auth) => { let status = 0, out = null;
    const res = { setHeader() {}, end(t) { out = JSON.parse(t); }, set statusCode(v) { status = v; } };
    await E({ method: 'POST', headers: { authorization: auth === undefined ? 'Bearer ' + 'k'.repeat(30) : auth }, body: body }, res); return { status: status, j: out }; };
  try {
    process.env.SUPABASE_URL = 'http://db.test'; process.env.SUPABASE_SECRET_KEY = 'k'; process.env.VERCEL_ENV = 'production';
    delete process.env.BACKUP_EXPORT_SECRET;
    assert.strictEqual((await call({ action: 'catalog' })).status, 503, 'not set up: nothing is given');
    process.env.BACKUP_EXPORT_SECRET = 'k'.repeat(30);
    assert.strictEqual((await call({ action: 'catalog' }, 'Bearer wrong')).status, 401);
    assert.strictEqual((await call({ action: 'catalog' }, '')).status, 401);
    asked.length = 0; let r = await call({ action: 'catalog' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.deepStrictEqual(r.j.tables.map(t => [t.name, t.title]), [['pur_people', 'People'], ['pur_activity', 'Activity']], 'the tables this database has; the sign-ins and tickets never');
    assert.deepStrictEqual(r.j.tables[0].cols, ['site', 'email', 'name', 'role', 'first_seen', 'last_seen'], 'a column added later never leaves by itself');
    assert.ok(asked.every(u => !/site=eq\./.test(u)), 'every site: no site filter');
    asked.length = 0; r = await call({ action: 'rows', table: 'pur_people' });
    assert.ok(/pur_people\?select=site,email,name,role,first_seen,last_seen&order=site\.asc,email\.asc&offset=0&limit=1000$/.test(asked[0]), asked[0]);
    asked.length = 0; await call({ action: 'rows', table: 'pur_activity', since: '2026-10-30T08:00:00Z' });
    assert.ok(/pur_activity\?select=id,at,site,email,action,target,detail&at=gte\.2026-10-30T08%3A00%3A00Z&order=id\.asc/.test(asked[0]), asked[0]);
    for (const t of ['pur_sessions', 'pur_tickets', 'web_props']) assert.strictEqual((await call({ action: 'rows', table: t })).status, 400, t);
    assert.strictEqual((await call({ action: 'usage' })).status, 400);
    assert.strictEqual((await call({ action: 'rows', table: 'pur_activity', since: "x';--" })).status, 400);
    const E2 = require('../api/backup-export.js').TABLES;
    assert.deepStrictEqual(Object.keys(E2), ['pur_people', 'pur_settings', 'pur_numbers', 'pur_activity']);
  } finally { global.fetch = f0; Object.keys(env).forEach(k => { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }); }
  // the same file as the Portal's and Engineering's (when they are next to this one)
  ['rcl-portal', 'rcl-engineering'].forEach(r => { const p = path.join(ROOT, '..', r, 'lib', 'bkexport.js'); if (fs.existsSync(p)) assert.strictEqual(fs.readFileSync(path.join(ROOT, 'lib', 'bkexport.js'), 'utf8'), fs.readFileSync(p, 'utf8'), r); });
});

/* ====================== PURCHASE PHASE 1 (09-11-2026): the rules, the database step, the link to the Store ====================== */
const R = require('../lib/rules');
const RFQ = { no: 7, site: 'S1', lines: [
  { line: 1, site: 'S1', req_no: 3, req_line: 1, ref: 'RCL/VTR/2026-27/P/0003', code: 'ITM-0001', name: 'Cement OPC 53', unit: 'Bag', qty: 10 },
  { line: 2, site: 'T2', req_no: 5, req_line: 2, ref: 'RCL/T2/2026-27/P/0005', code: 'ITM-0009', name: 'TMT 12 mm', unit: 'Kg', qty: 20 }] };
const QA = { vendor_id: 1, vendor_name: 'Asha Traders', freight: 150, loading: 40, lines: [{ line: 1, rate: 100, disc: 10, gst: 28, days: 3 }, { line: 2, rate: 50, disc: 0, gst: 18, days: 5 }] };
const QB = { vendor_id: 2, vendor_name: 'Bharat Steel', freight: 0, loading: 0, lines: [{ line: 1, rate: 98, disc: 0, gst: 28 }, { line: 2, rate: 56, disc: 0, gst: 18 }] };

test('P3 – the landed rate: rate less discount + freight and loading spread over the vendor\'s quoted lines by value; GST beside; L1 per line', () => {
  const sh = R.compare(RFQ, [QA, QB]), L1 = sh.lines[0], L2 = sh.lines[1];
  // Asha: net 90 × 10 = 900 and 50 × 20 = 1000 → base 1900; freight + loading 190 → every line + 10 % of its value
  assert.deepStrictEqual([L1.q[1].net, L1.q[1].landed, L1.q[1].value, L2.q[1].landed, L2.q[1].value], [90, 99, 990, 55, 1100]);
  assert.strictEqual(R.r2(L1.q[1].value + L2.q[1].value), 2090, 'the lines + freight + loading, to the paisa');
  assert.deepStrictEqual([L1.q[1].gst, L1.q[1].gst_amt, L2.q[1].gst_amt], [28, 252, 180], 'GST ₹ on the goods after the discount (as on the company\'s PO), shown beside');
  assert.deepStrictEqual([L1.q[2].landed, L2.q[2].landed], [98, 56], 'no freight: landed = rate');
  assert.deepStrictEqual([L1.l1, L1.l1_rate, L2.l1, L2.l1_rate], [[2], 98, [1], 55], 'L1: Bharat on cement (98 < 99), Asha on steel (55 < 56) – WITHOUT GST');
  assert.deepStrictEqual(sh.vendors.map(v => [v.name, v.total, v.extra, v.base, v.l1, v.quoted]), [['Asha Traders', 2090, 190, 1900, 1, 2], ['Bharat Steel', 2100, 0, 2100, 1, 2]]);
  // a vendor who quoted ONE line: his freight goes on that line only
  const QC = { vendor_id: 3, vendor_name: 'Chetan', freight: 100, loading: 0, lines: [{ line: 1, rate: 80, disc: 0 }, { line: 2, rate: '' }] };
  const s2 = R.compare(RFQ, [QC]);
  assert.deepStrictEqual([s2.lines[0].q[3].landed, s2.lines[1].q[3], s2.lines[1].n, s2.lines[1].l1], [90, undefined, 0, []], '800 + 100 freight on 10 bags = 90 a bag; line 2 not quoted');
  assert.strictEqual(s2.lines[0].q[3].gst, null, 'GST not given: shown as –, no GST ₹');
  // two equal landed rates (to the paisa): both L1
  const s3 = R.compare(RFQ, [QB, Object.assign({}, QB, { vendor_id: 4, vendor_name: 'Dinesh' })]);
  assert.deepStrictEqual(s3.lines[0].l1, [2, 4]);
});

test('P2 – item-wise award (each line its own vendor), a reason when not L1, at least 2 quotations or the CS\'s reason', () => {
  const sh = R.compare(RFQ, [QA, QB]);
  let a = R.awardOf(sh, { 1: { vendor: 2 }, 2: { vendor: 1 } }, '');
  assert.deepStrictEqual([a.problems, a.total, a.gst], [[], R.r2(980 + 1100), R.r2(98 * 10 * 0.28 + 180)], 'each line to its L1: one CS, two vendors');
  a = R.awardOf(sh, { 1: { vendor: 1 }, 2: { vendor: 1 } }, '');
  assert.ok(a.problems.length === 1 && /Line 1 .*not given to L1 – write why/.test(a.problems[0]), 'Asha is not L1 on cement: a reason');
  a = R.awardOf(sh, { 1: { vendor: 1, reason: 'Faster delivery (3 days)' }, 2: { vendor: 1 } }, '');
  assert.deepStrictEqual([a.problems, a.total, a.award[1].reason, a.award[2].reason], [[], 2090, 'Faster delivery (3 days)', ''], 'with the reason; an L1 line keeps no reason');
  a = R.awardOf(sh, { 1: { vendor: 2 } }, '');
  assert.ok(a.problems.some(p => /Line 2 .*not given to a supplier yet/.test(p)), 'every line is given before it is sent');
  assert.throws(() => R.awardOf(R.compare(RFQ, [QA, { vendor_id: 3, vendor_name: 'C', lines: [{ line: 1, rate: 99 }] }]), { 2: { vendor: 3 } }, ''), /did not quote it/, 'a vendor who did not quote a line cannot have it');
  // fewer than 2 quotations: only with the typed reason (kept on the CS)
  const one = R.compare(RFQ, [QA]);
  a = R.awardOf(one, R.awardL1(one), '');
  assert.strictEqual(a.problems.filter(p => /only 1 quotation – write why/.test(p)).length, 2);
  a = R.awardOf(one, R.awardL1(one), 'Only dealer of this brand near the site');
  assert.deepStrictEqual([a.problems, a.few], [[], 'Only dealer of this brand near the site']);
  assert.deepStrictEqual(R.awardL1(sh), { 1: { vendor: 2, reason: '' }, 2: { vendor: 1, reason: '' } }, 'a new CS starts with each line to its L1');
});

test('P1 – approval by amount (the Super Admin\'s limit), never one\'s own, a Purchase Admin of its site', () => {
  assert.deepStrictEqual([R.needOf(500000, 500000), R.needOf(500000.01, 500000), R.needOf(10, null), R.needOf(0, 0), R.needOf(1, 0)], ['admin', 'super', 'super', 'admin', 'super'], 'up to the limit: a Purchase Admin; above it or no limit: the Super Admin');
  const cs = { status: 'Sent', need: 'admin', site: 'S1', created_by: 'Maker@rcl.test', updated_by: 'editor@rcl.test', sent_by: 'maker@rcl.test' };
  const may = (c, email, role, site) => R.mayDecide(c, { email: email, role: role, site: site || 'S1' });
  assert.ok(!may(cs, 'maker@rcl.test', 'super').may && /his own/.test(may(cs, 'maker@rcl.test', 'super').why), 'the maker never – not even the Super Admin');
  assert.ok(!may(cs, 'EDITOR@rcl.test', 'admin').may, 'the last editor never');
  assert.ok(!may(Object.assign({}, cs, { sent_by: 'sender@rcl.test' }), 'sender@rcl.test', 'admin').may, 'who sent it never');
  assert.ok(may(cs, 'boss@rcl.test', 'admin').may, 'a Purchase Admin of S1, up to the limit');
  assert.ok(!may(cs, 'boss@rcl.test', 'admin', 'T2').may && /open Purchase on S1/.test(may(cs, 'boss@rcl.test', 'admin', 'T2').why), 'a Purchase Admin signed in on another site: not here');
  assert.ok(!may(cs, 'user@rcl.test', 'user').may, 'a Purchase User never approves');
  const big = Object.assign({}, cs, { need: 'super' });
  assert.ok(!may(big, 'boss@rcl.test', 'admin').may && may(big, 'md@rcl.test', 'super').may, 'above the limit: only the Super Admin');
  ['Draft', 'Approved', 'Sent back', 'Rejected'].forEach(st => assert.ok(!may(Object.assign({}, cs, { status: st }), 'md@rcl.test', 'super').may, st));
  assert.deepStrictEqual(R.makersOf(cs), ['maker@rcl.test', 'editor@rcl.test']);
});

// a made-up PostgREST for the server's actions (no database): answers by the address; records what was asked
function fakeDb(rows) {
  const asked = [], f0 = global.fetch, env = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_SECRET_KEY, v: process.env.VERCEL_ENV };
  process.env.SUPABASE_URL = 'http://db.test'; process.env.SUPABASE_SECRET_KEY = 'k'; process.env.VERCEL_ENV = 'production';
  global.fetch = async (url, o) => { const u = decodeURIComponent(String(url)), m = (o && o.method) || 'GET'; asked.push(m + ' ' + u.replace('http://db.test/rest/v1/', ''));
    const hit = rows.find(r => r.m === m && r.re.test(u)); return new Response(JSON.stringify(hit ? hit.out : []), { status: 200 }); };
  return { asked, done() { global.fetch = f0; process.env.SUPABASE_URL = env.u; process.env.SUPABASE_SECRET_KEY = env.k; if (env.v === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env.v; } };
}
test('a decision on the version seen: an older version, or one decided meanwhile (the database changed nothing), is refused – the first counts', async () => {
  const A = require('../api/pur.js').A;
  const cs = { no: 4, rfq_no: 7, site: 'S1', status: 'Sent', need: 'admin', version: 3, total: 2090, gst: 432.4, created_by: 'maker@rcl.test', updated_by: 'maker@rcl.test', sent_by: 'maker@rcl.test', trail: [], sheet: R.compare(RFQ, [QA, QB]), award: {} };
  const F = fakeDb([{ m: 'GET', re: /pur_cs\?select=\*&no=eq\.4/, out: [cs] }, { m: 'GET', re: /pur_rfq\?select=\*&no=eq\.7/, out: [Object.assign({ status: 'Quotes in', vendors: [], ver: 2 }, RFQ)] }]);
  const boss = { email: 'boss@rcl.test', name: 'Boss', role: 'admin', site: 'S1', info: { sites: [{ code: 'S1' }, { code: 'T2' }] } };
  try {
    await assert.rejects(A.csDecide(boss, { no: 4, version: 2, act: 'approve' }), e => e.status === 409 && e.code === 'changed', 'an older version');
    assert.ok(!F.asked.some(a => /^PATCH/.test(a)), 'nothing written');
    await assert.rejects(A.csDecide(boss, { no: 4, version: 3, act: 'approve' }), e => e.status === 409 && /decided by someone else/.test(e.message), 'the database changed no row (someone decided first)');
    assert.ok(F.asked.some(a => /^PATCH pur_cs\?no=eq\.4&version=eq\.3&status=eq\.Sent$/.test(a)), 'the write names the version and Sent');
    await assert.rejects(A.csDecide(boss, { no: 4, version: 3, act: 'reject', why: '' }), e => e.status === 400 && /Write why/.test(e.message), 'a rejection says why');
    await assert.rejects(A.csDecide(Object.assign({}, boss, { email: 'maker@rcl.test' }), { no: 4, version: 3, act: 'approve' }), e => e.status === 403 && /his own/.test(e.message), 'never his own');
    await assert.rejects(A.csDecide({ email: 'u@rcl.test', role: 'user', site: 'S1', info: { sites: [{ code: 'S1' }] } }, { no: 4, version: 3, act: 'approve' }), e => e.status === 403, 'a Purchase User of S1 only: the enquiry has a line of T2 – not his');
    await assert.rejects(A.settingsSave(boss, { limit: 5 }), e => e.status === 403 && /Only the Super Admin/.test(e.message), 'the limit: the Super Admin only');
    await assert.rejects(A.vendorStatus({ email: 'u@rcl.test', role: 'user', site: 'S1', info: {} }, { id: 1, status: 'Blocked', why: 'late' }), e => e.status === 403, 'a supplier blocked: Admin / Super Admin only');
  } finally { F.done(); }
});

test('suppliers: GST no., PAN (from the GST no.), e-mail and mobile checked as Mechanical\'s Vendor Master; the same name is one supplier', () => {
  const v = R.checkVendor({ name: '  Shree  Traders ', gstin: '27abcde1234f1z5', phone: '98765 43210', email: 'Sales@Shree.test', supplies: 'Cement, steel, cement' });
  assert.deepStrictEqual([v.name, v.name_key, v.gstin, v.pan, v.phone, v.email, v.supplies], ['Shree Traders', 'shreetraders', '27ABCDE1234F1Z5', 'ABCDE1234F', '9876543210', 'sales@shree.test', ['Cement', 'steel']]);
  assert.throws(() => R.checkVendor({ name: 'X Y', gstin: '27ABCDE1234F1Y5' }), /GST no\. .* not in the right format/);
  assert.throws(() => R.checkVendor({ name: 'X Y', gstin: '27ABCDE1234F1Z5', pan: 'ZZZZZ9999Z' }), /does not match the PAN inside the GST no\./);
  assert.throws(() => R.checkVendor({ name: 'X Y', pan: 'ABC' }), /PAN "ABC" is not in the right format/);
  assert.throws(() => R.checkVendor({ name: 'X Y', phone: '12345' }), /Mobile number should be 10 digits/);
  assert.throws(() => R.checkVendor({ name: 'X Y', email: 'no-at' }), /does not look right/);
  assert.throws(() => R.checkVendor({ name: ' - ' }), /Enter the supplier's name/);
  assert.strictEqual(R.checkVendor({ name: 'A B', phone: '+91 98765-43210' }).phone, '+919876543210', 'as Mechanical keeps it');
  assert.deepStrictEqual([R.waOf('9876543210'), R.waOf('+919876543210'), R.waOf('')], ['919876543210', '919876543210', '']);
  assert.strictEqual(R.keyOf('SHREE-TRADERS'), R.keyOf('Shree Traders'));
});

test('an enquiry\'s lines: from the Inbox only, never more than left, a line asked once; a quotation: a line not quoted is left out', () => {
  const pending = { 'S1:3:1': { line: 1, code: 'ITM-0001', name: 'Cement OPC 53', unit: 'Bag', qty: 200, ordered: 150, left: 50, ref: 'R3', brand: 'UltraTech', spec: '' } };
  const x = R.checkRfq({ date: R.today(), need_by: '', lines: [{ site: 's1', req_no: '3', req_line: 1, qty: '40' }], vendors: [2, '1', 2] });
  assert.deepStrictEqual([x.lines, x.vendors], [[{ site: 'S1', req_no: 3, req_line: 1, qty: 40 }], [2, 1]]);
  const lines = R.rfqLines(x.lines, pending, {}, [], new Set(['S1']), 0);
  assert.deepStrictEqual(lines.map(l => [l.line, l.name, l.qty, l.ref, l.brand]), [[1, 'Cement OPC 53', 40, 'R3', 'UltraTech']]);
  assert.throws(() => R.rfqLines([{ site: 'S1', req_no: 3, req_line: 1, qty: 60 }], pending, {}, [], null, 0), /only 50 Bag is still to order/);
  assert.throws(() => R.rfqLines(x.lines, pending, { 'S1:3:1': { rfq: 5 } }, [], null, 0), /already in RFQ-0005 – one line is asked once/);
  assert.doesNotThrow(() => R.rfqLines(x.lines, pending, { 'S1:3:1': { rfq: 9 } }, [], null, 9), 'its own enquiry');
  assert.throws(() => R.rfqLines(x.lines, {}, {}, [], null, 0), /not to order any more/);
  assert.throws(() => R.rfqLines(x.lines, pending, {}, [], new Set(['T2']), 0), /no Purchase there/);
  assert.deepStrictEqual(R.rfqLines([{ site: 'S1', req_no: 3, req_line: 1, qty: 30 }], {}, {}, lines, null, 9).map(l => [l.line, l.qty]), [[1, 30]], 'a line it has (less now): kept, the Store not asked');
  assert.throws(() => R.checkRfq({ date: R.today(), lines: [{ site: 'S1', req_no: 3, req_line: 1, qty: 1 }, { site: 'S1', req_no: 3, req_line: 1, qty: 2 }], vendors: [1] }), /twice/);
  assert.throws(() => R.checkRfq({ date: R.today(), lines: [{ site: 'S1', req_no: 3, req_line: 1, qty: 1 }], vendors: [] }), /Pick the suppliers/);
  const t = R.takenOf([{ no: 1, status: 'Sent', lines: [{ site: 'S1', req_no: 3, req_line: 1 }] }, { no: 2, status: 'Cancelled', lines: [{ site: 'S1', req_no: 4, req_line: 1 }] },
    { no: 3, status: 'Closed', lines: [{ site: 'S1', req_no: 5, req_line: 1 }] }, { no: 6, status: 'Closed', lines: [{ site: 'S1', req_no: 6, req_line: 1 }] }], { 3: { no: 2, status: 'Approved' }, 6: { no: 3, status: 'Rejected' } });
  assert.deepStrictEqual(t, { 'S1:3:1': { rfq: 1, status: 'Sent', cs: null }, 'S1:5:1': { rfq: 3, status: 'Awarded', cs: 2 } }, 'open or awarded; cancelled or rejected: free again');
  const q = R.checkQuote({ lines: [{ line: 1, rate: '1,250.5', disc: '5%', gst: '18', days: '7' }, { line: 2, rate: '' }], freight: '500', loading: '' }, RFQ.lines);
  assert.deepStrictEqual([q.lines, q.freight, q.loading], [[{ line: 1, rate: 1250.5, disc: 5, gst: 18, days: 7 }], 500, 0]);
  assert.throws(() => R.checkQuote({ lines: [{ line: 1, rate: 10, disc: 100 }] }, RFQ.lines), /Disc\. % of line 1/);
  assert.throws(() => R.checkQuote({ lines: [{ line: 2, rate: '' }] }, RFQ.lines), /at least one line/);
  assert.throws(() => R.checkQuote({ lines: [{ line: 1, rate: 10, days: 2.5 }] }, RFQ.lines), /whole days/);
});

test('database step 2: only adds (the number function only), every table for the server only, the header as step 1, "tables 4 of 4"', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'sql/pur_step2_rfq_cs.sql'), 'utf8'), body = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  const fn = /create or replace function public\.pur_next_no\(p_kind text\)[\s\S]*?\$\$;/.exec(body);
  assert.ok(fn && /insert into public\.pur_numbers/.test(fn[0]), 'the number of a kind in one step');
  const rest = body.replace(fn[0], '').split('\n').filter(l => !/\bgrant select, insert, update, delete on\b/.test(l)).join('\n');
  assert.ok(!/\bdrop\b|\btruncate\b|\bdelete\b|\bupdate\b|\binsert\b|\balter\s+table\s+public\.\w+\s+(drop|alter)/i.test(rest), 'only adds');
  const tables = ['pur_vendors', 'pur_rfq', 'pur_quote', 'pur_cs'];
  tables.forEach(t => assert.ok(new RegExp('create table if not exists public\\.' + t + ' \\(').test(body), t));
  assert.ok(new RegExp("foreach t in array array\\[" + tables.map(t => "'" + t + "'").join(', ') + "\\] loop").test(body), 'row level security on every table');
  assert.ok(/revoke all on public\.%I from public, anon, authenticated/.test(body) && /revoke all on function public\.pur_next_no\(text\) from public, anon, authenticated/.test(body));
  tables.forEach(t => assert.ok(new RegExp('public\\.' + t + ' \\([\\s\\S]*?\\bsite text not null').test(body), t + ' carries its site'));
  assert.ok(/' of 4' as done;/.test(body) && /Purchase step 2 done · tables /.test(body));
  ['Run ONCE in the Purchase Supabase project', 'It can be run again safely: it only ADDS', 'Rollback (only while nothing is entered)', 'Written fresh for RCL'].forEach(h => assert.ok(sql.indexOf(h) > -1, h));
  // the server names step 2 when its tables are missing; every save writes the activity record
  const src = fs.readFileSync(path.join(ROOT, 'api/pur.js'), 'utf8');
  assert.ok(/sql\/pur_step2_rfq_cs\.sql once in the rcl-purchase Supabase/.test(src));
  const act = n => { const i = src.indexOf('  async ' + n + '(s'); assert.ok(i > -1, n); return src.slice(i, src.indexOf('\n  },', i)); };
  ['settingsSave', 'vendorSave', 'vendorStatus', 'rfqSave', 'rfqSend', 'rfqCancel', 'quoteSave', 'csMake', 'csSave', 'csSend', 'csDecide'].forEach(n => assert.ok(/await activity\(/.test(act(n)), n + ' writes pur_activity'));
});

test('the link to the Store: signed with PUR_STORE_SECRET (HMAC-SHA256, the time, a one-time nonce); not set – nothing is asked', async () => {
  const L = require('../lib/storelink'), env = { s: process.env.PUR_STORE_SECRET, u: process.env.STORE_URL, p: process.env.PUBLIC_URL }, f0 = global.fetch;
  const sent = []; global.fetch = async (url, o) => { sent.push({ url: String(url), body: JSON.parse(o.body) }); return new Response(JSON.stringify({ sites: [], today: '2026-11-09' }), { status: 200 }); };
  try {
    delete process.env.PUR_STORE_SECRET; delete process.env.STORE_URL; process.env.PUBLIC_URL = 'https://erp.test/purchase';
    assert.strictEqual(L.linked(), false);
    await assert.rejects(L.pending(['S1']), e => e.status === 503 && e.code === 'link'); assert.strictEqual(sent.length, 0, 'nothing asked');
    process.env.PUR_STORE_SECRET = 'short'; await assert.rejects(L.pending(['S1']), e => e.code === 'link', 'a secret under 24 letters is no secret');
    process.env.PUR_STORE_SECRET = 'k'.repeat(30) + '\n';
    assert.strictEqual(L.storeUrl(), 'https://erp.test/store', 'the one address');
    await L.pending(['t2', 'S1', 'S1']);
    const b = sent[0].body;
    assert.strictEqual(sent[0].url, 'https://erp.test/store/api/purinbox');
    assert.deepStrictEqual([b.v, b.sites, /^[0-9a-f]{32}$/.test(b.nonce), Math.abs(b.ts - Date.now()) < 5000], [1, ['S1', 'T2'], true, true]);
    assert.strictEqual(b.sig, crypto.createHmac('sha256', 'k'.repeat(30)).update('rcl-pur-store|v1|' + b.ts + '|' + b.nonce + '|S1,T2').digest('hex'));
    await L.pending(['S1']); assert.notStrictEqual(sent[1].body.nonce, b.nonce, 'a new nonce each time');
    process.env.STORE_URL = 'http://127.0.0.1:3020'; assert.strictEqual(L.storeUrl(), 'http://127.0.0.1:3020');
    process.env.STORE_URL = 'http://evil.test'; assert.strictEqual(L.storeUrl(), 'https://erp.test/store', 'only https (http only for this computer)');
    // the Store's own check (rcl-store next to this one, on its branch): what Purchase signs is taken; a wrong secret, an old time are not
    const sp = path.join(ROOT, '..', 'rcl-store', 'api', 'purinbox.js');
    if (fs.existsSync(sp)) {
      const S = require(sp), k = 'k'.repeat(30);
      assert.deepStrictEqual(S.check(b, k, b.ts + 1000).sites, ['S1', 'T2']);
      assert.throws(() => S.check(b, 'x'.repeat(30), b.ts), e => e.status === 401 && e.code === 'sig');
      assert.throws(() => S.check(b, k, b.ts + 6 * 60000), e => e.status === 401 && e.code === 'time');
      assert.strictEqual(S.textOf(1, 'n', ['A', 'B']), L.textOf(1, 'n', ['A', 'B']), 'the same text signed on both sides');
    }
  } finally { global.fetch = f0; ['PUR_STORE_SECRET', 'STORE_URL', 'PUBLIC_URL'].forEach((k, i) => { const v = [env.s, env.u, env.p][i]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }); }
});

test('the pages of Phase 1: pur.js parses, draws every new page, the WhatsApp link (no e-mail), the CS side by side with L1', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/pur.js'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.doesNotThrow(() => new Function(js));
  assert.ok(html.indexOf('<script src="pur.js"></script>') > -1 && html.indexOf('window.RP = {') > -1);
  ['inbox', 'rfq', 'quotes', 'cs', 'approve', 'vendors', 'settings'].forEach(k => assert.ok(new RegExp('\\b' + k + ': ' + '\\w+').test(/window\.RPW = \{ open: page => \(\{([^}]*)\}/.exec(js)[1]), k));
  assert.ok(/'https:\/\/wa\.me\/' \+ \(v\.wa \|\| ''\) \+ '\?text=' \+ encodeURIComponent\(waText\(q, v\)\)/.test(js) && !/mailto:/.test(js), 'Share on WhatsApp – no e-mail');
  assert.ok(/<span class="tag">L1<\/span>/.test(js) && /Total without GST/.test(js) && /GST \(beside\)/.test(js));
});

test('(09-11-2026, his rule: every typed box gets the voice mic – "the app AND the website") Purchase\'s page has voice.js, the same file as the Store\'s and Engineering\'s: a number said in words → the number; the microphone for its own pages only', () => {
  const fs = require('fs'), path = require('path');
  const V = require('../public/voice.js');
  [['साडे तीन हजार', '3500'], ['twelve point five', '12.5'], ['1,200', '1200'], ['डेढ़ सौ', '150']].forEach(([said, want]) => assert.strictEqual(V.toNumber(said), want, said));
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.ok(page.includes('<script src="voice.js"></script>\n<script src="pur.js"></script>'), 'the page loads it (before its pages)');
  const pp = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8')).headers || []).flatMap(h => h.headers || []).find(h => h.key === 'Permissions-Policy').value;
  assert.strictEqual(pp, 'camera=(), microphone=(self), geolocation=()');
});
