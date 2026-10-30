/* Purchase through its own doors, on the local test rig (never the live databases):
 *   the Portal :3010 gives the tickets (as a person opens Purchase from it), Purchase :3050, its database rcl_pur (:3110).
 *   Test passwords only. The rig in plain mode (PORTAL=1 bash rig/all.sh).      timeout 300 node test/api.test.js
 * The test sets its own start: Purchase in the Portal's modules, access given on two sites, the Purchase tables emptied. */
'use strict';
const { execSync } = require('child_process');
const P = 'http://127.0.0.1:3010', U = 'http://127.0.0.1:3050';
let pass = 0, fail = 0; const out = [], T0 = Date.now();
const ok = (n, c, x) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !c ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 500) : '')); };
const sql = (db, q) => execSync('timeout 60 su postgres -c "psql -d ' + db + ' -tA -q"', { input: q }).toString().trim();
function client(base) {
  let cookie = '';
  const req = async (p, body, opt) => {
    opt = opt || {}; const h = { 'Content-Type': 'application/json' }; if (!opt.noHeader) h['X-RCL'] = '1'; if (cookie) h.Cookie = cookie;
    const r = await fetch(base + p, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(60000) });
    const sc = r.headers.get('set-cookie'); if (sc) { const v = sc.split(';')[0]; cookie = /=$/.test(v) ? '' : v; }
    let j = {}; try { j = JSON.parse(await r.text()); } catch (e) { j = {}; }
    return { status: r.status, j: j, loc: r.headers.get('location') || '' };
  };
  return { req, get cookie() { return cookie; }, set cookie(v) { cookie = v; } };
}
async function ticketFor(portal, mod, site) { const r = await portal.req('/api/go?module=' + mod + '&site=' + site); return (r.loc.split('#sso=')[1] || ''); }
async function portalAs(email, pw) {
  const p = client(P); let l = await p.req('/api/auth', { action: 'login', email: email, password: pw });
  if (l.status !== 200 && email === 'sa@rcl.test') l = await p.req('/api/auth', { action: 'login', email: email, password: 'Super#Admin2041' });
  if (l.status !== 200) throw new Error('Portal sign-in of ' + email + ': ' + JSON.stringify(l.j));
  return p;
}
async function purAs(email, pw, site) {
  const p = await portalAs(email, pw), s = client(U), t = await ticketFor(p, 'purchase', site), r = await s.req('/api/sso', { ticket: t });
  return { p, s, t, r };
}
const SAPW = 'Super#Admin2040', PW = 'Nashik#Road848!', VPW = 'Audit#PassView9!x';

(async () => {
  // ---- the start: Purchase in the Portal's modules; sujit Purchase Admin on S1 and T2; view Purchase User on S1 only ----
  sql('rcl_portal', "insert into modules (key, name, url, status, sort) values ('purchase', 'Purchase', 'http://127.0.0.1:3050', 'live', 4) on conflict (key) do update set url = excluded.url, status = 'live'; " +
    "delete from access where module = 'purchase'; insert into access (email, site, module, role, granted_by) values ('sujit@rcl.test', 'S1', 'purchase', 'admin', 'test'), ('sujit@rcl.test', 'T2', 'purchase', 'admin', 'test'), ('view@rcl.test', 'S1', 'purchase', 'user', 'test');");
  sql('rcl_pur', 'truncate public.pur_people, public.pur_settings, public.pur_numbers, public.pur_sessions, public.pur_tickets, public.pur_activity; alter sequence public.pur_activity_id_seq restart;');

  // ---- sign-in through the Portal ----
  const SA = await purAs('sa@rcl.test', SAPW, 'S1'), AD = await purAs('sujit@rcl.test', PW, 'S1'), US = await purAs('view@rcl.test', VPW, 'S1');
  ok('the Super Admin opens Purchase on S1 from the Portal: role "super", every site', SA.r.status === 200 && SA.r.j.user.role === 'super' && SA.r.j.site === 'S1' && SA.r.j.sites.length >= 2, SA.r.j);
  ok('sujit: Purchase Admin, his sites S1 and T2 (from the Portal, nothing set here)', AD.r.j.user.role === 'admin' && JSON.stringify(AD.r.j.sites.map(s => s.code).sort()) === '["S1","T2"]', AD.r.j);
  ok('view: Purchase User of S1 only', US.r.j.user.role === 'user' && JSON.stringify(US.r.j.sites.map(s => s.code)) === '["S1"]', US.r.j);
  ok('   only a fingerprint of each sign-in is kept; the cookie is rcl_pur', sql('rcl_pur', "select count(*) from pur_sessions where length(id_hash) = 64") === '3' && /^rcl_pur=/.test(US.s.cookie));
  ok('   everyone who signed in is on the site\'s list of people', sql('rcl_pur', "select string_agg(email || ':' || role, ',' order by email) from pur_people where site = 'S1'") === 'sa@rcl.test:super,sujit@rcl.test:admin,view@rcl.test:user', sql('rcl_pur', 'select * from pur_people'));
  ok('   the sign-ins are in the activity record (with their site)', sql('rcl_pur', "select count(*) from pur_activity where action = 'Sign-in' and site = 'S1'") === '3');
  let r = await client(U).req('/api/sso', { ticket: US.t });
  ok('the same ticket again: refused (a ticket opens Purchase once)', r.status === 401 && /already used/.test(r.j.error), r.j);
  r = await client(U).req('/api/sso', { ticket: await ticketFor(US.p, 'mechanical', 'S1') });
  ok('a ticket made for another module (Mechanical): refused', r.status === 401 && /another module/.test(r.j.error || ''), r.j);
  const T2ofView = await US.p.req('/api/go?module=purchase&site=T2');
  ok('view has no Purchase on T2: the Portal gives no ticket', !/#sso=/.test(T2ofView.loc), T2ofView);
  r = await client(U).req('/api/sso', { ticket: await ticketFor(US.p, 'purchase', 'S1') }, { noHeader: true });
  ok('a request not from the Purchase page (no header): refused', r.status === 403, r.j);
  r = await client(U).req('/api/sso', { ticket: 'abc.def.ghi' });
  ok('a made-up ticket: refused', r.status === 401 && r.j.code === 'ticket', r.j);
  r = await US.s.req('/api/me');
  ok('/api/me: who, which site, which role, his sites', r.j.signedIn && r.j.site === 'S1' && r.j.user.role === 'user' && r.j.portal === P && r.j.sites.length === 1, r.j);
  r = await US.s.req('/menu.json'); const r2 = await client(U).req('/menu.json');
  ok('/menu.json: the Dashboard (signed in and before)', JSON.stringify(r.j.pages) === '[{"key":"dashboard","name":"Dashboard"}]' && r2.j.module === 'purchase' && r2.j.pages.length === 1, [r.j, r2.j]);
  // the fresh ticket every 10 minutes (renew): the sign-in is replaced, nothing written again
  const before = sql('rcl_pur', "select count(*) from pur_activity"), t2 = (await US.p.req('/api/go?module=purchase&site=S1&json=1&renew=1')).j.ticket;
  r = await US.s.req('/api/sso', { ticket: t2, renew: 1 });
  ok('renewed: a new sign-in in place of the old one; no new activity line', r.status === 200 && sql('rcl_pur', "select count(*) from pur_sessions where email = 'view@rcl.test'") === '1' && sql('rcl_pur', "select count(*) from pur_activity") === before, r.j);
  // a person whose Purchase the Super Admin takes away: no fresh ticket
  sql('rcl_portal', "delete from access where module = 'purchase' and email = 'view@rcl.test'");
  r = await US.p.req('/api/go?module=purchase&site=S1&json=1&renew=1');
  ok('Purchase taken away in the Portal: no fresh ticket (he is out within 15 minutes)', r.status === 403 && r.j.code === 'noaccess', r.j);
  sql('rcl_portal', "insert into access (email, site, module, role, granted_by) values ('view@rcl.test', 'S1', 'purchase', 'user', 'test')");
  // sign out
  r = await US.s.req('/api/logout', {});
  ok('Logout: the sign-in ends here (its row goes), the cookie is cleared', r.status === 200 && US.s.cookie === '' && sql('rcl_pur', "select count(*) from pur_sessions where email = 'view@rcl.test'") === '0', r.j);
  r = await US.s.req('/api/me');
  ok('   after it: not signed in', r.j.signedIn === false, r.j);
  // a new site: given in the Portal – it is in his list at his next ticket, nothing to set up in Purchase
  sql('rcl_portal', "insert into sites (code, name, status, sort) values ('N9', 'New Site Nine', 'active', 9) on conflict (code) do nothing; insert into access (email, site, module, role, granted_by) values ('sujit@rcl.test', 'N9', 'purchase', 'admin', 'test') on conflict do nothing;");
  const AD2 = await purAs('sujit@rcl.test', PW, 'N9');
  ok('a NEW site given in the Portal: Purchase opens on it at once, in the same database (nothing to set up)', AD2.r.status === 200 && AD2.r.j.site === 'N9' && AD2.r.j.sites.some(s => s.code === 'N9') && sql('rcl_pur', "select count(*) from pur_people where site = 'N9'") === '1', AD2.r.j);
  sql('rcl_portal', "delete from access where site = 'N9'; delete from sites where code = 'N9';");

  console.log(out.join('\n'));
  console.log('\nTOTAL ' + pass + ' passed, ' + fail + ' failed  (' + Math.round((Date.now() - T0) / 1000) + ' s)');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(out.join('\n')); console.error('CRASH', e); process.exit(2); });
