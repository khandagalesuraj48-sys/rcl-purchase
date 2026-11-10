/* PURCHASE PHASE 2 – PURCHASE ORDERS on the local test rig (never the live databases) – 10-11-2026:
 *   the Portal :3010 (tickets, Users & Access, Workflow), Purchase :3050 (its database rcl_pur :3110 – steps 2 and 3 applied), the Store
 *   :3020 (its sites S1 – rcl :3100, T2 – rcl_s2 :3102 – its step 10 applied), both servers started with the SAME made-up PUR_STORE_SECRET
 *   (their start command only – never in a file).
 *       PUR_STORE_SECRET=<that test value> timeout 500 node test/po.test.js      (STOREDOWN=0: the Store is not stopped for the "Store not
 *       answering" part – it is left out)
 * The story: one approved CS gives one PO a supplier × site (P2) – PO-0001 … never twice; each PO's copy at the site's Store at once:
 * approved and Open although the site has a PO approver and verifier (G-6), with its requirement and line on each line; the Inbox's
 * "left" falls by itself, "Awarded" becomes the PO number; the site's GRNs (five, as his "500 MT in 5 GRNs") lower the balance and
 * Purchase sees each; cancel refused after a GRN, done before (the site's copy Cancelled, the lines free in the Inbox again); the Store
 * not answering → "Not yet at the site" → Send again works once; an answer lost after the copy was written → Send again: still one copy;
 * an older revision never over a newer one; wrong secret / old time / a nonce twice refused; another site's person refused; the site
 * cannot change, cancel, close or delete a Purchase PO; every save in pur_activity. It sets its own start (rig only) and takes out what
 * it put in the sites at the end (its requirements, items, POs and GRNs). */
'use strict';
const { execSync } = require('child_process'), crypto = require('crypto');
const P = 'http://127.0.0.1:3010', U = 'http://127.0.0.1:3050', ST = 'http://127.0.0.1:3020';
let pass = 0, fail = 0; const out = [], T0 = Date.now();
const ok = (n, c, x) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !c ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 900) : '')); };
const sql = (db, q) => execSync('timeout 60 su postgres -c "psql -d ' + db + ' -tA -q"', { input: q }).toString().trim();
const wait = ms => new Promise(r => setTimeout(r, ms));
function client(base) {
  let cookie = '';
  const req = async (p, body, opt) => {
    opt = opt || {}; const h = { 'Content-Type': 'application/json' }; if (!opt.noHeader) h['X-RCL'] = '1'; if (cookie) h.Cookie = cookie;
    const r = await fetch(base + p, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(90000) });
    const sc = r.headers.get('set-cookie'); if (sc) { const v = sc.split(';')[0]; cookie = /=$/.test(v) ? '' : v; }
    let j = {}; try { j = JSON.parse(await r.text()); } catch (e) { j = {}; }
    return { status: r.status, j: j, loc: r.headers.get('location') || '' };
  };
  return { req };
}
async function ticketFor(portal, mod, site) { const r = await portal.req('/api/go?module=' + mod + '&site=' + site); return (r.loc.split('#sso=')[1] || ''); }
async function portalAs(email, pw) {
  const p = client(P); let l = await p.req('/api/auth', { action: 'login', email: email, password: pw });
  if (l.status !== 200 && email === 'sa@rcl.test') l = await p.req('/api/auth', { action: 'login', email: email, password: 'Super#Admin2040' });
  if (l.status !== 200) throw new Error('Portal sign-in of ' + email + ': ' + JSON.stringify(l.j));
  return p;
}
async function signIn(base, mod, email, pw, site) {
  const p = await portalAs(email, pw), s = client(base), r = await s.req('/api/sso', { ticket: await ticketFor(p, mod, site) });
  if (r.status !== 200) throw new Error(mod + ' sign-in of ' + email + ' at ' + site + ': ' + JSON.stringify(r.j));
  return s;
}
const act = (c, action, x) => c.req('/api/pur', Object.assign({ action: action }, x || {}));
const work = (c, action, x) => c.req('/api/work', Object.assign({ action: action }, x || {}));
const PW = 'Nashik#Road848!', VPW = 'Audit#PassView9!x';
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const lineOf = (inbox, site, req, line) => { const st = (inbox.sites || []).find(x => x.site === site); const q = st && st.reqs.find(x => x.no === req); return q && q.lines.find(x => x.line === line); };
const REQ = (no, lines) => "(" + no + ", current_date - 2, current_date + 10, 'Site work', 'Rig – Purchase Phase 2', '', '" + JSON.stringify(lines) + "', 'Approved', 0, '[{\"level\":1,\"email\":\"x@rcl.test\",\"name\":\"X\",\"at\":\"2026-11-08T10:00:00Z\",\"ok\":true}]', 'view@rcl.test', 'View User')";
const ITEM = (code, name, unit, gst) => "('" + code + "', '" + name + "', '" + name.toLowerCase().replace(/[^a-z0-9]+/g, '') + "', '" + unit + "', 'P2 Test', " + gst + ", 'Active', 'test')";
const K = String(process.env.PUR_STORE_SECRET || '').trim();
const door = async (op, data, opt) => { opt = opt || {}; const ts = opt.ts || Date.now(), nonce = opt.nonce || crypto.randomBytes(16).toString('hex'), d = JSON.stringify(data);
  const sig = crypto.createHmac('sha256', opt.key || K).update(['rcl-pur-po', 'v1', op, ts, nonce, d].join('|')).digest('hex');
  const x = await fetch(ST + '/api/purpo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 1, op: op, ts: ts, nonce: nonce, data: d, sig: sig }), signal: AbortSignal.timeout(30000) });
  return { status: x.status, j: await x.json().catch(() => ({})) }; };
const fault = (port, f) => fetch('http://127.0.0.1:' + port + '/__fault', { method: 'POST', body: JSON.stringify(f || {}) }).then(r => r.text());
const storeUp = async () => { for (let i = 0; i < 40; i++) { try { const r = await fetch(ST + '/', { signal: AbortSignal.timeout(2000) }); if (r.status === 200) return true; } catch (e) { /* not yet */ } await wait(250); } return false; };
function storeStop() { execSync("for pid in $(pgrep -x node); do [ \"$(readlink /proc/$pid/cwd)\" = /home/claude/rcl-store ] && tr '\\0' ' ' < /proc/$pid/cmdline | grep -q '^node dev.js' && kill $pid; done; sleep 0.8; true", { shell: '/bin/bash' }); }
const storeStart = () => execSync('timeout 30 bash /home/claude/rig/store_srv.sh', { env: Object.assign({}, process.env, { STORE_TODAY_RULE: 'off' }), shell: '/bin/bash' }).toString();

(async () => {
  if (K.length < 24) { console.log('Give this test the rig\'s PUR_STORE_SECRET (the running servers\' made-up test value).'); process.exit(1); }
  // ---- the start (rig only) ----
  const pagesBefore = sql('rcl_portal', "select coalesce(json_agg(a), '[]') from (select email, site, pages from access where module = 'store' and site = 'S1' and email in ('view@rcl.test', 'store@rcl.test')) a");
  sql('rcl_portal', "insert into users (email, name, password_hash, active) select 'acct@rcl.test', 'Asha Accounts', password_hash, true from users where email = 'view@rcl.test' on conflict (email) do update set active = true; " +
    "insert into modules (key, name, url, status, sort) values ('purchase', 'Purchase', 'http://127.0.0.1:3050', 'live', 4) on conflict (key) do update set url = excluded.url, status = 'live'; " +
    "delete from access where module = 'purchase'; insert into access (email, site, module, role, granted_by) values ('sujit@rcl.test', 'S1', 'purchase', 'admin', 'test'), ('sujit@rcl.test', 'T2', 'purchase', 'admin', 'test'), " +
    "('view@rcl.test', 'S1', 'purchase', 'user', 'test'), ('store@rcl.test', 'S1', 'purchase', 'user', 'test'), ('store@rcl.test', 'T2', 'purchase', 'user', 'test'), ('acct@rcl.test', 'T2', 'purchase', 'user', 'test'); delete from counters;");
  sql('rcl_pur', "truncate public.pur_po, public.pur_cs, public.pur_quote, public.pur_rfq, public.pur_vendors restart identity; delete from public.pur_numbers where kind in ('RFQ', 'CS', 'PO'); " +
    "insert into public.pur_settings (site, id, value, updated_by) values ('*', 'cs_limit', '{\"amount\": 50000}', 'sa@rcl.test') on conflict (site, id) do update set value = excluded.value;");
  const clean = () => { for (const db of ['rcl', 'rcl_s2']) sql(db, "delete from store_grn_lines where grn_no in (select g.no from store_grn g join store_po p on p.no = g.po_no where p.pur_no is not null); delete from store_grn where po_no in (select no from store_po where pur_no is not null); " +
    "delete from store_po where pur_no is not null; delete from store_req where no between 9001 and 9010; delete from items where code like 'ITM-98__';"); };
  clean();
  sql('rcl', "insert into items (code, name, name_key, unit, category, gst_pct, status, created_by) values " + [ITEM('ITM-9801', 'P2 Cement PPC', 'Bag', 28), ITEM('ITM-9802', 'P2 TMT Bar 16 mm', 'Kg', 18), ITEM('ITM-9803', 'P2 Binding Wire', 'Kg', 18)].join(', ') + ";" +
    "insert into store_req (no, date, need_by, for_kind, for_text, remark, lines, status, level, approvals, created_by, created_name) values " +
    REQ(9001, [{ line: 1, code: 'ITM-9801', name: 'P2 Cement PPC', unit: 'Bag', qty: 100, brand: 'UltraTech', spec: 'PPC' }, { line: 2, code: 'ITM-9802', name: 'P2 TMT Bar 16 mm', unit: 'Kg', qty: 500 }, { line: 3, code: 'ITM-9803', name: 'P2 Binding Wire', unit: 'Kg', qty: 50 }]) + ', ' +
    REQ(9002, [{ line: 1, code: 'ITM-9801', name: 'P2 Cement PPC', unit: 'Bag', qty: 500 }]) + ';');
  sql('rcl_s2', "insert into items (code, name, name_key, unit, category, gst_pct, status, created_by) values " + ITEM('ITM-9811', 'P2 Diesel Filter', 'Nos', 18) + ";" +
    "insert into store_req (no, date, need_by, for_kind, for_text, remark, lines, status, level, approvals, created_by, created_name) values " + REQ(9001, [{ line: 1, code: 'ITM-9811', name: 'P2 Diesel Filter', unit: 'Nos', qty: 4 }]) + ';');
  const SAP = await portalAs('sa@rcl.test', 'Super#Admin2041');
  const actFrom = [Number(sql('rcl', 'select coalesce(max(id), 0) from store_activity')), Number(sql('rcl_s2', 'select coalesce(max(id), 0) from store_activity'))];
  try {
    // the Portal: the sites' requirements go to Head Office (Workflow); at S1 a PO verifier and a PO approver (view) – a PO of the Store would wait
    for (const site of ['S1', 'T2']) await SAP.req('/api/admin', { action: 'rulesSave', site: site, ho: { req: true, grn: false, iss: false } });
    let r = await SAP.req('/api/admin', { action: 'storePagesSave', email: 'view@rcl.test', site: 'S1', pages: { dashboard: 'View', items: 'View', req: 'Edit', grn: 'View', issue: 'View', reports: 'View', po: 'View', approve: 'L1', vpo: 'Yes', poapprove: 'Yes' } });
    let r1 = await SAP.req('/api/admin', { action: 'storePagesSave', email: 'store@rcl.test', site: 'S1', pages: { dashboard: 'View', items: 'Edit', req: 'View', grn: 'Edit', issue: 'Edit', reports: 'View', po: 'View', approve: 'L1' } });
    const apv = JSON.parse(sql('rcl', "select value::text from store_settings where id = 'approvers'") || '{}');
    ok('the start: S1 has a PO verifier and a PO approver (view) – a Store PO would wait there; store@ makes GRNs at S1', r.status === 200 && r1.status === 200 && (apv.po || []).some(p => p.email === 'view@rcl.test') && ((apv.wf || {}).verify || {}).po.some(p => p.email === 'view@rcl.test'), [r.j, r1.j, apv.po]);

    const SA = await signIn(U, 'purchase', 'sa@rcl.test', 'Super#Admin2041', 'S1'), AD = await signIn(U, 'purchase', 'sujit@rcl.test', PW, 'S1');
    const US = await signIn(U, 'purchase', 'store@rcl.test', VPW, 'S1'), V1 = await signIn(U, 'purchase', 'view@rcl.test', VPW, 'S1'), AC = await signIn(U, 'purchase', 'acct@rcl.test', VPW, 'T2');
    r = await US.req('/menu.json');
    ok('the menu: Purchase Orders after the Comparative Statement (every Purchase person)', r.j.pages.map(p => p.key).join() === 'dashboard,inbox,rfq,quotes,cs,po,vendors', r.j.pages);

    // ---- suppliers, an enquiry of S1 and T2 lines, two quotations, the CS approved ----
    const vs = {};
    for (const [k, v] of [['A', { name: 'Asha Traders', gstin: '27ABCDE1234F1Z5', phone: '9876543210', email: 'sales@asha.test', address: 'Nashik Road, Nashik' }], ['B', { name: 'Bharat Steel', phone: '9822012345', address: 'MIDC Bhiwandi' }]]) vs[k] = (await act(US, 'vendorSave', v)).j.vendor;
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), L = (site, req, line, qty) => ({ site: site, req_no: req, req_line: line, qty: qty });
    r = await act(US, 'rfqSave', { date: today, lines: [L('S1', 9001, 1, 100), L('S1', 9001, 2, 500), L('S1', 9001, 3, 50), L('T2', 9001, 1, 4)], vendors: [vs.A.id, vs.B.id] }); const RFQ1 = r.j.rfq;
    await act(US, 'rfqSend', { no: RFQ1.no, ver: RFQ1.ver });
    r = await act(US, 'quoteSave', { rfq: RFQ1.no, vendor: vs.A.id, lines: [{ line: 1, rate: 100, disc: 10, gst: 28 }, { line: 2, rate: 50, gst: 18 }, { line: 3, rate: 60 }, { line: 4, rate: 900, gst: 18 }], freight: 200, loading: 40, pay_terms: '30 days credit' });
    r1 = await act(US, 'quoteSave', { rfq: RFQ1.no, vendor: vs.B.id, lines: [{ line: 1, rate: 85, gst: 28 }, { line: 2, rate: 56, gst: 18 }, { line: 3, rate: 65, gst: 18 }, { line: 4, rate: 950, gst: 18 }], pay_terms: 'Against delivery' });
    let C = (await act(US, 'csMake', { rfq: RFQ1.no })).j.cs;
    ok('RFQ-0001 (S1: Cement, TMT, Binding Wire; T2: Diesel Filter) – Asha and Bharat quoted; CS-0001 made: Cement to Bharat (L1), the rest to Asha (L1)', r.status === 200 && r1.status === 200 && C && C.ref === 'CS-0001' &&
      Number(C.award[1].vendor) === vs.B.id && [2, 3, 4].every(n => Number(C.award[n].vendor) === vs.A.id) && C.problems.length === 0, C && [C.award, C.problems]);
    r = await act(US, 'poNew', { cs: C.no, vendor: vs.A.id, site: 'S1' });
    ok('no PO before the CS is approved', r.status === 409 && /only from an approved CS/.test(r.j.error), r.j);
    r = await act(US, 'csSend', { no: C.no, version: C.version }); C = r.j.cs;
    r = await act(AD, 'csDecide', { no: C.no, version: C.version, act: 'approve' }); C = r.j.cs;
    ok('CS-0001 sent and approved by the Purchase Admin of S1', r.status === 200 && C.status === 'Approved', r.j);

    // ---- the CS shows its POs: one a supplier × site ----
    r = await act(US, 'csGet', { no: C.no });
    const G = (r.j.po || { groups: [] }).groups, gkey = G.map(g => g.vendor_name + '×' + g.site + ':' + g.lines).join();
    ok('the approved CS: its POs one a supplier × site – Asha × S1 (2 lines), Asha × T2 (1), Bharat × S1 (1); none made yet; he may make each', r.status === 200 && r.j.po.step3 === true && gkey === 'Asha Traders×S1:2,Asha Traders×T2:1,Bharat Steel×S1:1' && G.every(g => !g.po && g.may), [gkey, G]);
    ok('   a GST % not quoted (Binding Wire) is said', G[0].missing === 1 && G[1].missing === 0, G);
    r = await act(V1, 'csGet', { no: C.no }); r1 = await act(AC, 'poNew', { cs: C.no, vendor: vs.A.id, site: 'T2' });
    ok('   one with Purchase on S1 only (or T2 only) does not see the CS of S1 and T2 lines (Phase 1\'s rule) – no PO from it', r.status === 403 && r1.status === 403, [r.j, r1.j]);

    // ---- the PO's form starts with the site's own address, contact and terms (the Store's PO form – HO Purchase's purItems) ----
    r = await act(US, 'poNew', { cs: C.no, vendor: vs.A.id, site: 'S1' });
    const HO = await signIn(ST, 'store', 'sujit@rcl.test', PW, 'T2'), pi = await work(HO, 'purItems', { site: 'S1' });
    const NW = r.j, la = (rate, disc) => r2(rate * (1 - disc / 100));
    ok('PO form of Asha × S1: the site\'s shipping address, contact and terms as the Store\'s own PO form has them; his payment terms; the lines with qty, rate, Disc. %, GST %, landed',
      r.status === 200 && pi.status === 200 && NW.start.ship_to === pi.j.papers.ship_to && NW.start.site_contact === pi.j.papers.site_contact && NW.start.terms === pi.j.papers.terms && NW.start.pay_terms === '30 days credit' &&
      NW.money.lines.map(l => [l.cs_line, l.req_no, l.req_line, l.qty, l.rate, l.disc_pct, l.gst_pct].join('|')).join() === '2|9001|2|500|50|0|18,3|9001|3|50|60|0|' && NW.money.missing.join() === '3', [NW.start, pi.j.papers, NW.money && NW.money.lines]);
    // freight + loading of Asha's quotation (240) – the part of his quoted lines' value these two lines are
    const base = 90 * 100 + 50 * 500 + 60 * 50 + 900 * 4, mine = 50 * 500 + 60 * 50, fr = r2(200 * mine / base), ld = r2(40 * mine / base);
    ok('   freight ' + fr + ' and loading ' + ld + ' – Asha\'s 200 + 40 spread over his quoted lines by value, as the CS', NW.money.freight === fr && NW.money.loading === ld, [NW.money.freight, NW.money.loading]);
    const head = { cs: C.no, vendor: vs.A.id, site: 'S1', date: today, need_by: '', pay_terms: '30 days credit', ship_to: NW.start.ship_to, site_contact: NW.start.site_contact, terms: NW.start.terms, remark: 'Rig PO' };
    r = await act(US, 'poMake', head);
    ok('   saved without the GST % of the line not quoted: refused, said which', r.status === 400 && /GST % of line 3 \(P2 Binding Wire\)/.test(r.j.error), r.j);
    r = await act(US, 'poMake', Object.assign({}, head, { ship_to: '' }));
    ok('   without a shipping address: refused', r.status === 400 && /shipping address/.test(r.j.error), r.j);
    r = await act(US, 'poMake', Object.assign({}, head, { date: '2026-01-01', gst: { 3: 18 } }));
    ok('   a PO date before its CS was approved: refused', r.status === 400 && /before its CS was approved/.test(r.j.error), r.j);
    r = await act(US, 'poMake', Object.assign({}, head, { gst: { 3: 18 } }));
    const PO1 = r.j.po, tx = 25000 + 3000, gst1 = r2(25000 * 0.18 + 3000 * 0.18), tot1 = r2(tx + gst1 + fr + ld);
    ok('PO-0001 made (Asha × S1): Cement–TMT 500 Kg @ 50, Binding Wire 50 Kg @ 60 (GST 18 % typed); amount ' + tx + ' + GST ' + gst1 + ' + freight + loading = ' + tot1 + ' – at the site at once', r.status === 200 && r.j.sent === true && PO1.ref === 'PO-0001' &&
      PO1.taxable === tx && PO1.gst === gst1 && PO1.total === tot1 && PO1.state === 'At the site' && PO1.sent.store_no > 0 && PO1.lines.length === 2, r.j);
    const cp1 = JSON.parse(sql('rcl', "select row_to_json(p) from store_po p where pur_no = 1") || '{}');
    ok('   its copy in S1\'s Store: approved and Open (G-6 – not waiting for S1\'s PO verifier / approver), From Purchase PO-0001 rev 1, the same figures, each line its requirement and line',
      cp1.no === PO1.sent.store_no && cp1.appr === 'Approved' && cp1.status === 'Open' && cp1.wf === null && cp1.pur_rev === 1 && cp1.pur.ref === 'PO-0001' && cp1.pur.cs.ref === 'CS-0001' &&
      Number(cp1.taxable) === tx && Number(cp1.gst) === gst1 && Number(cp1.total) === tot1 && Number(cp1.freight) === fr && Number(cp1.load_unload) === ld &&
      cp1.lines.map(l => [l.code, l.qty, l.req_no, l.req_line].join('|')).join() === 'ITM-9802|500|9001|2,ITM-9803|50|9001|3' && cp1.vendor === 'Asha Traders' && cp1.vendor_gst === '27ABCDE1234F1Z5' && cp1.appr_name === 'Sujit Test', cp1);
    const SV = await signIn(ST, 'store', 'view@rcl.test', VPW, 'S1'), pl = await work(SV, 'poList'), sp = (pl.j.pos || []).find(p => p.no === cp1.no);
    ok('   the Store\'s PO list at S1 (as its PO verifier / approver): nothing to verify or approve on it; it shows as Purchase\'s', !!sp && sp.appr === 'Approved' && sp.mayApprove === false && sp.step === '' && sp.pur_no === 1 && sp.pur.ref === 'PO-0001', sp);
    r = await act(US, 'inbox'); const hp = await work(HO, 'purPending');
    const hl = (site, req, line) => { const s = (hp.j.sites || []).find(x => x.site === site); const q = s && s.reqs.find(x => x.no === req); return q && q.lines.find(x => x.line === line); };
    ok('the Inbox\'s "left" falls by itself: TMT and Binding Wire of 9001 are ordered (gone); Cement still "Awarded" (its PO not made); the Store\'s HO list the same', !lineOf(r.j, 'S1', 9001, 2) && !lineOf(r.j, 'S1', 9001, 3) && lineOf(r.j, 'S1', 9001, 1).taken.status === 'Awarded' &&
      hl('S1', 9001, 2).left === 0 && hl('S1', 9001, 2).ordered === 500 && hl('S1', 9001, 3).left === 0 && hl('S1', 9001, 1).left === 100, [lineOf(r.j, 'S1', 9001, 1), hl('S1', 9001, 2)]);

    // ---- the other two POs of the same CS; the same one twice at the same moment – one PO ----
    r = await act(US, 'poNew', { cs: C.no, vendor: vs.B.id, site: 'S1' });
    const hB = { cs: C.no, vendor: vs.B.id, site: 'S1', date: today, pay_terms: r.j.start.pay_terms, ship_to: r.j.start.ship_to, site_contact: r.j.start.site_contact, terms: r.j.start.terms };
    const [m1, m2] = await Promise.all([act(US, 'poMake', hB), act(AD, 'poMake', hB)]);
    const made = [m1, m2].filter(x => x.status === 200), other = [m1, m2].filter(x => x.status === 409);
    ok('Bharat × S1 made twice at the same moment: ONE PO, the other told', made.length === 1 && other.length === 1 && /made by someone else just now|made already/.test(other[0].j.error) && sql('rcl_pur', "select count(*) from pur_po where vendor_id = " + vs.B.id) === '1', [m1.status, m2.status, other[0] && other[0].j]);
    const PO2 = made[0].j.po;
    // T2 without the Store's step 10 (rig only: its three columns, index and functions taken out first – STEP10=0 leaves this out)
    const s10 = process.env.STEP10 !== '0';
    if (s10) { sql('rcl_s2', "drop function if exists public.store_po_pur_put(jsonb, text, text); drop function if exists public.store_po_pur_cancel(jsonb, text, text, text); drop index if exists public.store_po_pur_no; " +
      "alter table public.store_po drop column if exists pur_no, drop column if exists pur_rev, drop column if exists pur; notify pgrst, 'reload schema';"); await wait(1200); }
    r = await act(US, 'poNew', { cs: C.no, vendor: vs.A.id, site: 'T2' });
    r = await act(US, 'poMake', { cs: C.no, vendor: vs.A.id, site: 'T2', date: today, pay_terms: '30 days credit', ship_to: r.j.start.ship_to || 'T2 site store', site_contact: r.j.start.site_contact, terms: r.j.start.terms });
    let PO3 = r.j.po;
    if (s10) {
      ok('Asha × T2 while T2 has no Store step 10: PO made, kept in Purchase "Not yet at the site" – why: step 10 to run at T2', r.status === 200 && r.j.sent === false && PO3.state === 'Not yet at the site' && /step 10 is not run at site T2/.test(PO3.sent.error), r.j);
      execSync('timeout 60 su postgres -c "psql -d rcl_s2 -v ON_ERROR_STOP=1 -tA -q"', { input: require('fs').readFileSync('/home/claude/rcl-store/sql/store_step10_purchase_po.sql') }); await wait(1200);
      r = await act(US, 'poSend', { no: PO3.no }); PO3 = r.j.po;
    }
    ok('Asha × T2: its PO (Diesel Filter 4 Nos) at T2\'s Store' + (s10 ? ' – after step 10, Send again' : '') + ' – one CS gave three POs', r.status === 200 && r.j.sent && PO3.site === 'T2' && PO3.state === 'At the site' && sql('rcl_s2', 'select count(*) from store_po where pur_no = ' + PO3.no) === '1', r.j);
    const nums = sql('rcl_pur', 'select string_agg(no::text, \',\' order by no) from pur_po'), stores = [sql('rcl', 'select count(*) from store_po where pur_no is not null'), sql('rcl_s2', 'select count(*) from store_po where pur_no is not null')];
    ok('   PO numbers never given twice (' + nums + '); one copy a PO at its site (S1 ' + stores[0] + ', T2 ' + stores[1] + ')', new Set(nums.split(',')).size === 3 && stores.join() === '2,1' && PO1.no < PO2.no && PO2.no < PO3.no, [nums, stores]);
    r = await act(US, 'csGet', { no: C.no }); r1 = await act(US, 'rfqList'); const cl = await act(AD, 'csList', {});
    ok('the CS shows its three POs; the enquiry list and the CS list name them', r.j.po.groups.every(g => g.po && !g.may) && (r1.j.rfqs.find(q => q.no === RFQ1.no).cs.pos || []).length === 3 && (cl.j.list.find(c => c.no === C.no).pos || []).length === 3, [r.j.po.groups, cl.j.list]);
    r = await act(US, 'inbox');
    ok('   the Inbox: S1 9001 and T2 9001 all ordered – gone', !lineOf(r.j, 'S1', 9001, 1) && !lineOf(r.j, 'T2', 9001, 1), r.j.sites.map(s => s.reqs.map(q => q.no)));

    // ---- access: another site's person ----
    r = await act(AC, 'poGet', { no: PO1.no }); r1 = await act(V1, 'poGet', { no: PO3.no });
    const lv = await act(V1, 'poList'), la2 = await act(AC, 'poList');
    ok('another site\'s person: a PO of S1 refused to one of T2 only, of T2 to one of S1 only; each list only his site\'s POs', r.status === 403 && r1.status === 403 && lv.j.pos.every(p => p.site === 'S1') && lv.j.pos.length === 2 && la2.j.pos.map(p => p.ref).join() === PO3.ref, [r.j, r1.j, lv.j.pos.map(p => p.ref), la2.j.pos.map(p => p.ref)]);

    // ---- the site's GRNs against the copy: his "500 MT in 5 GRNs" – Bharat's Cement 100 Bag in five of 20 ----
    const GK = await signIn(ST, 'store', 'store@rcl.test', VPW, 'S1'), cpB = Number(sql('rcl', 'select no from store_po where pur_no = ' + PO2.no));
    r = await work(GK, 'poOpen');
    ok('the site\'s GRN form offers the copy (approved, open) – From Purchase ' + PO2.ref, (r.j.pos || []).some(p => p.no === cpB && p.pur_no === PO2.no), (r.j.pos || []).map(p => [p.no, p.pur_no]));
    let lefts = [], seen = [];
    for (let i = 1; i <= 5; i++) {
      const g = await work(GK, 'grnSave', { grn: { po_no: cpB, date: today, supplier: 'Bharat Steel', invoice_no: 'BS-' + i, lines: [{ code: 'ITM-9801', qty: 20, rate: 85, gst_pct: 28, po_line: 1 }] } });
      const v = await act(US, 'poGet', { no: PO2.no });
      lefts.push(g.status === 200 && v.j.site ? v.j.site.lines[0].left : 'x'); seen.push(v.j.po.state + ':' + (v.j.site ? v.j.site.grns.length : '?'));
      if (i === 1) { r1 = await act(AD, 'poCancel', { no: PO2.no, ver: v.j.po.ver, why: 'Not needed now' });
        ok('   after the first GRN: cancel refused – said which GRN', r1.status === 409 && r1.j.code === 'received' && /Material of this PO has come at site S1/.test(r1.j.error) && sql('rcl', 'select status from store_po where no = ' + cpB) === 'Open', r1.j); }
    }
    ok('five GRNs at the site: each lowers the balance and Purchase sees it – 80, 60, 40, 20, 0 · ' + seen.join(' '), lefts.join() === '80,60,40,20,0' && seen.join() === 'Partly received:1,Partly received:2,Partly received:3,Partly received:4,Received:5', [lefts, seen]);
    r = await act(US, 'poGet', { no: PO2.no });
    ok('   Purchase sees the PO in full: each GRN (date, invoice, its lines) checked with the PO – as per PO', r.j.site.grns.length === 5 && r.j.site.grns.every(g => g.check && g.check.ok && g.lines[0].qty === 20) && r.j.site.grns.map(g => g.invoice_no).join() === 'BS-1,BS-2,BS-3,BS-4,BS-5' && r.j.may.cancel === false, r.j.site);
    r = await act(US, 'poList');
    ok('   the PO list: Received (5 GRN), At the site, …', r.j.store.ok && r.j.pos.find(p => p.no === PO2.no).state === 'Received' && r.j.pos.find(p => p.no === PO2.no).grns === 5 && r.j.pos.find(p => p.no === PO1.no).state === 'At the site', r.j.pos);

    // ---- the site cannot change, cancel, close or delete a Purchase PO ----
    const SAd = await signIn(ST, 'store', 'sujit@rcl.test', PW, 'S1');
    const tries = await Promise.all([work(SAd, 'poClose', { no: cp1.no }), work(HO, 'poCancel', { site: 'S1', no: cp1.no }), work(HO, 'poClose', { site: 'S1', no: cp1.no }), work(HO, 'poDelete', { site: 'S1', no: cp1.no }),
      work(HO, 'poSave', { site: 'S1', no: cp1.no, po: { date: today, vendor: 'Asha Traders', lines: [{ code: 'ITM-9802', qty: 1, rate: 1 }] } }), work(SV, 'poDecide', { no: cp1.no, ok: true })]);
    const own = await work(SAd, 'poCancel', { no: cp1.no });
    ok('the site (its Store Admin, HO Purchase of the Store, its PO approver) cannot close, cancel, delete, change or decide a Purchase PO – "only in Purchase"', tries.every(t => t.status === 409 && t.j.code === 'purchase' && /PO-0001/.test(t.j.error)) && own.status === 403 &&
      sql('rcl', 'select status || appr from store_po where no = ' + cp1.no) === 'OpenApproved', tries.map(t => [t.status, t.j.error]).concat([[own.status, own.j.error]]));

    // ---- cancel before a GRN: PO-0003 (T2) – the copy Cancelled, its line free again ----
    r = await act(US, 'poCancel', { no: PO3.no, ver: PO3.ver, why: 'T2 buys it locally' }); r1 = await act(AD, 'poCancel', { no: PO3.no, ver: PO3.ver, why: '' });
    ok('cancel: a Purchase User cannot; the Admin is asked why', r.status === 403 && r1.status === 400, [r.j, r1.j]);
    r = await act(AD, 'poCancel', { no: PO3.no, ver: PO3.ver, why: 'T2 buys it locally' });
    const c3 = JSON.parse(sql('rcl_s2', 'select row_to_json(p) from store_po p where pur_no = ' + PO3.no) || '{}'); r1 = await act(US, 'inbox');
    ok('PO-0003 cancelled by the Admin (no GRN at T2): its copy at T2 Cancelled (why kept); Diesel Filter free again in the Inbox (4 to order, no PO)', r.status === 200 && r.j.po.status === 'Cancelled' && r.j.po.state === 'Cancelled' && c3.status === 'Cancelled' && c3.pur.cancelled.why === 'T2 buys it locally' &&
      lineOf(r1.j, 'T2', 9001, 1) && lineOf(r1.j, 'T2', 9001, 1).left === 4 && !lineOf(r1.j, 'T2', 9001, 1).taken, [r.j.po && r.j.po.state, c3.status, lineOf(r1.j, 'T2', 9001, 1)]);
    r = await act(AD, 'poCancel', { no: PO3.no, ver: r.j.po.ver, why: 'again' }); r1 = await act(US, 'poSend', { no: PO3.no });
    ok('   cancelled already: not again; not sent again', r.status === 409 && r1.status === 409, [r.j, r1.j]);

    // ---- a second CS: the Store does not answer → "Not yet at the site" → Send again – once ----
    r = await act(US, 'rfqSave', { date: today, lines: [L('S1', 9002, 1, 500)], vendors: [vs.A.id, vs.B.id] }); const RFQ2 = r.j.rfq;
    await act(US, 'rfqSend', { no: RFQ2.no, ver: RFQ2.ver });
    await act(US, 'quoteSave', { rfq: RFQ2.no, vendor: vs.A.id, lines: [{ line: 1, rate: 80, gst: 28 }] }); await act(US, 'quoteSave', { rfq: RFQ2.no, vendor: vs.B.id, lines: [{ line: 1, rate: 82, gst: 28 }] });
    let C2 = (await act(US, 'csMake', { rfq: RFQ2.no })).j.cs; C2 = (await act(US, 'csSend', { no: C2.no, version: C2.version })).j.cs; C2 = (await act(AD, 'csDecide', { no: C2.no, version: C2.version, act: 'approve' })).j.cs;
    ok('CS-0002: Cement 500 Bag of requirement 9002 to Asha – approved', C2 && C2.status === 'Approved', C2);
    const h4 = { cs: C2.no, vendor: vs.A.id, site: 'S1', date: today, pay_terms: '', ship_to: 'VTR site office\nBhiwandi', site_contact: '', terms: '' };
    r = await act(AD, 'vendorStatus', { id: vs.A.id, ver: vs.A.ver, status: 'Blocked', why: 'Rig: late twice' }); r1 = await act(US, 'poMake', h4);
    const r5 = await act(AD, 'vendorStatus', { id: vs.A.id, ver: r.j.vendor.ver, status: 'Approved' });
    ok('a supplier Blocked since the CS: no PO to him ("approve him again first"); approved again', r.status === 200 && r1.status === 409 && r1.j.code === 'blocked' && /Blocked/.test(r1.j.error) && r5.status === 200 && sql('rcl_pur', 'select count(*) from pur_po where cs_no = ' + C2.no) === '0', [r1.j, r5.j]);
    let PO4 = null;
    if (process.env.STOREDOWN !== '0') {
      storeStop();
      r = await act(US, 'poMake', h4); PO4 = r.j.po;
      ok('the Store stopped: PO-0004 made and kept in Purchase as "Not yet at the site" (why: the Store did not answer)', r.status === 200 && r.j.sent === false && PO4.state === 'Not yet at the site' && /did not answer/.test(PO4.sent.error) && r.j.may.send === true, r.j);
      r = await act(US, 'inbox');
      ok('   the Inbox meanwhile: it says the Store did not answer', r.status === 503 && /did not answer/.test(r.j.error), r.j);
      storeStart(); ok('   the Store started again', await storeUp());
      r = await act(US, 'inbox'); const t4 = lineOf(r.j, 'S1', 9002, 1);
      ok('   (the Store up) the line still to order – 500, "' + PO4.ref + ' · Not yet at the site"', t4 && t4.left === 500 && t4.taken && t4.taken.status === PO4.ref && t4.taken.po === PO4.no && t4.taken.sent === false, t4);
      r = await act(US, 'poSend', { no: PO4.no }); r1 = await act(US, 'poSend', { no: PO4.no });
      ok('   Send again: at the site now; a second Send again refused ("at the site already"); ONE copy', r.status === 200 && r.j.sent === true && r.j.po.state === 'At the site' && r1.status === 409 && /at the site already/.test(r1.j.error) && sql('rcl', 'select count(*) from store_po where pur_no = ' + PO4.no) === '1', [r.j.po && r.j.po.state, r1.j]);
    } else {
      r = await act(US, 'poMake', h4); PO4 = r.j.po; out.push('NOTE STOREDOWN=0: the Store was not stopped – "Store not answering" left out');
    }
    r = await act(US, 'inbox'); const h2 = await work(HO, 'purPending');
    ok('   the Inbox\'s "left" fell by itself: 9002 ordered – gone (the Store\'s HO list the same)', !lineOf(r.j, 'S1', 9002, 1) && !(((h2.j.sites || []).find(x => x.site === 'S1') || { reqs: [] }).reqs.find(q => q.no === 9002)), lineOf(r.j, 'S1', 9002, 1));

    // ---- an answer lost after the copy was written (the database did it, the answer never came) → Send again: still ONE copy ----
    // (a third CS for Asha × S1 is not possible – one PO a supplier × site of a CS; a new requirement line 9003 for it)
    sql('rcl', "insert into store_req (no, date, need_by, for_kind, for_text, remark, lines, status, level, approvals, created_by, created_name) values " + REQ(9003, [{ line: 1, code: 'ITM-9803', name: 'P2 Binding Wire', unit: 'Kg', qty: 25 }]) + ';');
    r = await act(US, 'rfqSave', { date: today, lines: [L('S1', 9003, 1, 25)], vendors: [vs.A.id, vs.B.id] }); const RFQ3 = r.j.rfq; await act(US, 'rfqSend', { no: RFQ3.no, ver: RFQ3.ver });
    await act(US, 'quoteSave', { rfq: RFQ3.no, vendor: vs.B.id, lines: [{ line: 1, rate: 61, gst: 18 }] });
    let C3 = (await act(US, 'csMake', { rfq: RFQ3.no })).j.cs; C3 = (await act(US, 'csSend', { no: C3.no, version: C3.version, few_reason: 'Asha gave no rate' })).j.cs; C3 = (await act(AD, 'csDecide', { no: C3.no, version: C3.version, act: 'approve' })).j.cs;
    await fault(3100, { match: '^POST /rest/v1/rpc/store_po_pur_put', after: true, drop: true, n: 1 });
    r = await act(US, 'poMake', { cs: C3.no, vendor: vs.B.id, site: 'S1', date: today, ship_to: 'VTR site office' }); const PO5 = r.j.po;
    await fault(3100, {});
    ok('PO-0005: the site\'s database wrote the copy but its answer was lost – "Not yet at the site"', r.status === 200 && r.j.sent === false && PO5.state === 'Not yet at the site' && sql('rcl', 'select count(*) from store_po where pur_no = ' + PO5.no) === '1', [r.j.sent, PO5 && PO5.sent]);
    r = await act(US, 'poSend', { no: PO5.no });
    ok('   Send again: the same copy (nothing new at the site) – at the site; still ONE copy', r.status === 200 && r.j.sent === true && r.j.po.state === 'At the site' && sql('rcl', 'select count(*) from store_po where pur_no = ' + PO5.no) === '1' &&
      Number(sql('rcl', 'select no from store_po where pur_no = ' + PO5.no)) === r.j.po.sent.store_no, r.j.po && r.j.po.sent);

    // ---- the Store's door itself: an older revision never over a newer one; a later one not yet; wrong secret / old time / a nonce twice ----
    const cp5 = JSON.parse(sql('rcl', 'select row_to_json(p) from store_po p where pur_no = ' + PO5.no));
    const copy5 = (await act(US, 'poGet', { no: PO5.no })).j.po, body5 = { site: 'S1', po: { pur_no: PO5.no, rev: 1, ref: copy5.ref, date: copy5.date, vendor: copy5.vendor, lines: copy5.lines.map(l => ({ code: l.code, qty: l.qty, rate: l.rate, disc_pct: l.disc_pct, gst_pct: l.gst_pct, req_no: l.req_no, req_line: l.req_line })),
      freight: copy5.freight, loading: copy5.loading, ship_to: copy5.ship_to, totals: { taxable: copy5.taxable, gst: copy5.gst, total: copy5.total }, cs: {}, rfq: {}, by: { email: 'store@rcl.test', name: 'Store' } } };
    sql('rcl', 'update store_po set pur_rev = 2 where pur_no = ' + PO5.no);
    const u2 = sql('rcl', 'select updated_at::text from store_po where pur_no = ' + PO5.no);
    r = await door('put', body5); r1 = await door('put', Object.assign({}, body5, { po: Object.assign({}, body5.po, { rev: 3 }) }));
    ok('the Store\'s door: revision 1 sent to a copy of revision 2 – "older", nothing changed; revision 3 – not taken yet (a PO amendment comes later)', r.status === 200 && r.j.result === 'older' && r.j.no === cp5.no && r1.status === 409 && r1.j.code === 'amend' &&
      sql('rcl', 'select pur_rev::text || \'|\' || updated_at::text from store_po where pur_no = ' + PO5.no) === '2|' + u2, [r.j, r1.j]);
    sql('rcl', 'update store_po set pur_rev = 1 where pur_no = ' + PO5.no);
    r = await door('put', Object.assign({}, body5, { po: Object.assign({}, body5.po, { totals: { taxable: 1, gst: 1, total: 2 } }) }));
    ok('   other figures than the Store works out: refused – nothing kept', r.status === 409 && r.j.code === 'figures', r.j);
    const n1 = crypto.randomBytes(16).toString('hex');
    const a1 = await door('state', { q: [{ site: 'S1', nos: [PO1.no] }] }, { nonce: n1 }), a2 = await door('state', { q: [{ site: 'S1', nos: [PO1.no] }] }, { nonce: n1 });
    const w = await door('state', { q: [] }, { key: 'wrong-secret-0123456789abcdefgh' }), o = await door('state', { q: [] }, { ts: Date.now() - 6 * 60000 });
    const t = await fetch(ST + '/api/purpo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 1, op: 'put', ts: Date.now(), nonce: n1, data: JSON.stringify(body5), sig: crypto.createHmac('sha256', K).update(['rcl-pur-store', 'v1', Date.now(), n1, 'S1'].join('|')).digest('hex') }) });
    const b = await fetch(ST + '/api/purpo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RCL': '1' }, body: '{}' });
    ok('   the signed question answered; the same nonce again, a wrong secret, an old time, the Inbox\'s signature, a browser\'s call – refused', a1.status === 200 && a1.j.sites[0].pos[0].pur_no === PO1.no && a2.status === 401 && a2.j.code === 'nonce' &&
      w.status === 401 && w.j.code === 'sig' && o.status === 401 && o.j.code === 'time' && t.status === 401 && b.status === 400, [a1.status, a2.j, w.j, o.j, t.status, b.status]);

    // ---- every save in pur_activity (with its site); the Store's own record of each copy ----
    const acts = sql('rcl_pur', "select string_agg(action || ':' || n, ',' order by action) from (select action, count(*) n from pur_activity where action like 'PO %' group by action) x");
    ok('every PO save in pur_activity (with its site): ' + acts, ['PO cancelled', 'PO made', 'PO not yet at the site', 'PO sent again', 'PO sent to the site'].every(a => acts.indexOf(a + ':') > -1) &&
      sql('rcl_pur', "select count(*) from pur_activity where action like 'PO %' and (site = '' or site is null)") === '0', acts);
    const sa = sql('rcl', "select string_agg(action, ',' order by id) from store_activity where action like 'PO % Purchase%' and id > " + actFrom[0]), sa2 = sql('rcl_s2', "select string_agg(action, ',' order by id) from store_activity where action like 'PO % Purchase%' and id > " + actFrom[1]);
    ok('   the sites\' Store activity: "PO from Purchase" each copy made (S1: PO-0001, 0002, 0004), the same copy again (PO-0005, its first answer lost), "PO cancelled by Purchase" (T2)',
      sa === 'PO from Purchase,PO from Purchase,' + (process.env.STOREDOWN !== '0' ? 'PO from Purchase,' : 'PO from Purchase,') + 'PO from Purchase (the same copy again)' && sa2 === 'PO from Purchase,PO cancelled by Purchase', [sa, sa2]);
    const pn = sql('rcl_pur', "select string_agg(no::text, ',' order by no) from pur_po"), nx = Number(sql('rcl_pur', "select next_no from pur_numbers where kind = 'PO'"));
    ok('the PO numbers never given twice (' + pn + '; a number taken by the PO made twice at the same moment is not given again – the next ' + nx + ')', sql('rcl_pur', 'select count(distinct no) from pur_po') === '5' && sql('rcl_pur', 'select count(*) from pur_po') === '5' && nx > Math.max(...pn.split(',').map(Number)), [pn, nx]);
  } catch (e) { ok('the run finished', false, e.stack || String(e)); }
  finally {
    try { await fault(3100, {}); } catch (e) { /* the door */ }
    try { if (!(await storeUp())) storeStart(); } catch (e) { out.push('NOTE the Store could not be started again: ' + e.message); }
    // put back what this test changed outside Purchase's own tables (rig only): its requirements, items, POs and GRNs at the sites; the Store pages
    try { clean(); } catch (e) { out.push('NOTE clean-up: ' + e.message); }
    try { for (const a of JSON.parse(pagesBefore)) if (a.pages) await SAP.req('/api/admin', { action: 'storePagesSave', email: a.email, site: a.site, pages: a.pages }); } catch (e) { out.push('NOTE the Store pages were not put back: ' + e.message); }
  }
  console.log(out.join('\n'));
  console.log('\nTOTAL ' + pass + ' passed, ' + fail + ' failed  (' + Math.round((Date.now() - T0) / 1000) + ' s)');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(out.join('\n')); console.error('CRASH', e); process.exit(2); });
