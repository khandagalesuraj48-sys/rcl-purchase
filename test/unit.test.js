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
  ['user', 'admin', 'super'].forEach(r => assert.deepStrictEqual(m.PAGES.filter(p => m.mayOpen(p.who, r)).map(p => p.key), ['dashboard'], r));
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
  const env = { VERCEL_ENV: process.env.VERCEL_ENV, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY }, f0 = global.fetch;
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
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    assert.ok(/if \(j\.preview \|\| \/\^This is a Preview\/\.test\(String\(j\.error \|\| ''\)\)\) previewBand\(\);/.test(html) && /id = 'rcl_preview_band'/.test(html));
    ['me.js', 'sso.js'].forEach(f => assert.ok(/preview: isPreview\(\) \|\| undefined/.test(fs.readFileSync(path.join(ROOT, 'api', f), 'utf8')), f));
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
