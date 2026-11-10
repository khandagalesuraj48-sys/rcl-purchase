/* PURCHASE PHASE 1 on the local test rig (never the live databases) – 09-11-2026:
 *   the Portal :3010 (tickets), Purchase :3050 (its database rcl_pur :3110, step 2 applied), the Store :3020 (its sites S1 – rcl :3100,
 *   T2 – rcl_s2 :3102), both servers started with the SAME made-up PUR_STORE_SECRET (in the rig's start command only – never in a file).
 *       PUR_STORE_SECRET=<that test value> timeout 400 node test/rfqcs.test.js      (without it the direct checks of the Store's door are left out)
 * The story: the CS limit; suppliers; the Inbox (the Store's own figures – compared with the Store's HO Purchase list); enquiries (a line
 * asked once, never more than left, only one's own sites); quotations (history, locked); the CS (landed rate, L1, item-wise award, reasons);
 * its approval by amount, never one's own, two decisions at the same moment, sent back, rejected; the signed call to the Store refused when
 * wrong. It sets its own start (rig only): Purchase's tables emptied, approved requirements 9001 … put in S1 and T2 (taken out at the end),
 * access in the Portal (put back at the end). */
'use strict';
const { execSync } = require('child_process'), crypto = require('crypto');
const P = 'http://127.0.0.1:3010', U = 'http://127.0.0.1:3050', ST = 'http://127.0.0.1:3020';
let pass = 0, fail = 0; const out = [], T0 = Date.now();
const ok = (n, c, x) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !c ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700) : '')); };
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
  return { req };
}
async function ticketFor(portal, mod, site) { const r = await portal.req('/api/go?module=' + mod + '&site=' + site); return (r.loc.split('#sso=')[1] || ''); }
async function portalAs(email, pw) {
  const p = client(P); let l = await p.req('/api/auth', { action: 'login', email: email, password: pw });
  if (l.status !== 200 && email === 'sa@rcl.test') l = await p.req('/api/auth', { action: 'login', email: email, password: 'Super#Admin2041' });
  if (l.status !== 200) throw new Error('Portal sign-in of ' + email + ': ' + JSON.stringify(l.j));
  return p;
}
async function signIn(base, mod, email, pw, site) {
  const p = await portalAs(email, pw), s = client(base), r = await s.req('/api/sso', { ticket: await ticketFor(p, mod, site) });
  if (r.status !== 200) throw new Error(mod + ' sign-in of ' + email + ' at ' + site + ': ' + JSON.stringify(r.j));
  return s;
}
const act = (c, action, x) => c.req('/api/pur', Object.assign({ action: action }, x || {}));
const PW = 'Nashik#Road848!', VPW = 'Audit#PassView9!x';
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const lineOf = (inbox, site, req, line) => { const st = (inbox.sites || []).find(x => x.site === site); const q = st && st.reqs.find(x => x.no === req); return q && q.lines.find(x => x.line === line); };
const REQ = (no, st, lines, need) => "(" + no + ", current_date - 2, " + (need ? "current_date + " + need : 'null') + ", 'Site work', 'Rig – Purchase Phase 1', '', '" + JSON.stringify(lines) + "', '" + st + "', 0, '[{\"level\":1,\"email\":\"x@rcl.test\",\"name\":\"X\",\"at\":\"2026-11-08T10:00:00Z\",\"ok\":true}]', 'view@rcl.test', 'View User')";

(async () => {
  // ---- the start (rig only) ----
  const accBefore = sql('rcl_portal', "select coalesce(json_agg(a), '[]') from (select email, site, module, role, granted_by, pages from access where module in ('purchase', 'store') and email in ('sujit@rcl.test', 'view@rcl.test', 'store@rcl.test')) a");
  sql('rcl_portal', "insert into modules (key, name, url, status, sort) values ('purchase', 'Purchase', 'http://127.0.0.1:3050', 'live', 4) on conflict (key) do update set url = excluded.url, status = 'live'; " +
    "delete from access where module = 'purchase'; insert into access (email, site, module, role, granted_by) values ('sujit@rcl.test', 'S1', 'purchase', 'admin', 'test'), ('sujit@rcl.test', 'T2', 'purchase', 'admin', 'test'), " +
    "('view@rcl.test', 'S1', 'purchase', 'user', 'test'), ('store@rcl.test', 'S1', 'purchase', 'user', 'test'), ('store@rcl.test', 'T2', 'purchase', 'user', 'test'); " +
    "delete from access where module = 'store' and email = 'sujit@rcl.test' and site = 'T2'; insert into access (email, site, module, role, granted_by, pages) values ('sujit@rcl.test', 'T2', 'store', 'user', 'test', '{\"purchase\":\"Edit\"}');");
  sql('rcl_pur', "truncate public.pur_cs, public.pur_quote, public.pur_rfq, public.pur_vendors restart identity; delete from public.pur_numbers where kind in ('RFQ', 'CS'); delete from public.pur_settings where id = 'cs_limit';");
  sql('rcl', 'delete from store_req where no between 9001 and 9010; insert into store_req (no, date, need_by, for_kind, for_text, remark, lines, status, level, approvals, created_by, created_name) values ' + [
    REQ(9001, 'Approved', [{ line: 1, code: 'ITM-0001', name: 'Cement OPC 53', unit: 'Bag', qty: 100, brand: 'UltraTech', spec: 'OPC 53 grade' }, { line: 2, code: 'ITM-0002', name: 'TMT Bar 12 mm', unit: 'Kg', qty: 500 }], 10),
    REQ(9002, 'Pending', [{ line: 1, code: 'ITM-0003', name: 'Binding Wire', unit: 'Kg', qty: 25 }]),
    REQ(9003, 'Approved', [{ line: 1, code: 'ITM-0004', name: 'Crushed Sand', unit: 'Brass', qty: 30 }], 7),
    REQ(9004, 'Approved', [{ line: 1, code: 'ITM-0005', name: 'Bitumen VG30', unit: 'MT', qty: 10 }], 20)].join(', ') + ';');
  sql('rcl_s2', 'delete from store_req where no between 9001 and 9010; insert into store_req (no, date, need_by, for_kind, for_text, remark, lines, status, level, approvals, created_by, created_name) values ' +
    REQ(9001, 'Approved', [{ line: 1, code: 'ITM-0101', name: 'Diesel Filter', unit: 'Nos', qty: 4 }], 5) + ';');
  try {
    const SA = await signIn(U, 'purchase', 'sa@rcl.test', 'Super#Admin2040', 'S1'), AD = await signIn(U, 'purchase', 'sujit@rcl.test', PW, 'S1');
    const US = await signIn(U, 'purchase', 'view@rcl.test', VPW, 'S1'), U2 = await signIn(U, 'purchase', 'store@rcl.test', VPW, 'S1'), AD2 = await signIn(U, 'purchase', 'sujit@rcl.test', PW, 'T2');
    let r = await US.req('/menu.json'), r1 = await AD.req('/menu.json'), r3 = await SA.req('/menu.json');
    ok('the menu: a Purchase User – Inbox, Enquiries, Quotations, Comparative Statement, Suppliers; the Admin + Waiting for my approval; the Super Admin + Settings',
      r.j.pages.map(p => p.key).join() === 'dashboard,inbox,rfq,quotes,cs,vendors' && r1.j.pages.map(p => p.key).join() === 'dashboard,inbox,rfq,quotes,cs,approve,vendors' && r3.j.pages.length === 8, [r.j.pages, r1.j.pages]);

    // ---- the CS limit (the Super Admin) ----
    r = await act(US, 'settings');
    ok('the limit not set yet: null (every CS would go to the Super Admin)', r.status === 200 && r.j.limit === null && r.j.maySet === false, r.j);
    r = await act(AD, 'settingsSave', { limit: 50000 }); r1 = await act(US, 'settingsSave', { limit: 50000 });
    ok('   a Purchase Admin / User cannot set it', r.status === 403 && r1.status === 403, [r.j, r1.j]);
    const limAct = Number(sql('rcl_pur', "select count(*) from pur_activity where action = 'CS limit set'"));      // (the test may run again – only this run's line counts)
    r = await act(SA, 'settingsSave', { limit: '50,000' });
    ok('the Super Admin sets ₹50,000 – kept for every site (*), in the activity record', r.status === 200 && r.j.limit === 50000 && sql('rcl_pur', "select value->>'amount' from pur_settings where site = '*' and id = 'cs_limit'") === '50000' &&
      Number(sql('rcl_pur', "select count(*) from pur_activity where action = 'CS limit set'")) === limAct + 1, r.j);

    // ---- suppliers ----
    const vs = {};
    for (const [k, v] of [['A', { name: 'Asha Traders', gstin: '27abcde1234f1z5', phone: '98765 43210', email: 'sales@asha.test', address: 'Nashik', supplies: 'Cement, Steel' }], ['B', { name: 'Bharat Steel', phone: '9822012345', supplies: ['Steel', 'Bitumen'] }], ['C', { name: 'Chetan Hardware', phone: '9011122233' }]]) {
      r = await act(US, 'vendorSave', v); vs[k] = r.j.vendor;
    }
    ok('a Purchase User adds suppliers: Approved; the PAN from the GST no.; the WhatsApp number', vs.A && vs.A.status === 'Approved' && vs.A.pan === 'ABCDE1234F' && vs.A.gstin === '27ABCDE1234F1Z5' && vs.A.wa === '919876543210' && vs.B && vs.C, vs);
    r = await act(AD, 'vendorSave', { name: 'ASHA-traders' }); r1 = await act(AD, 'vendorSave', { name: 'Zed', gstin: '27ABCDE1234F1Z' });
    ok('   the same name again: refused; a wrong GST no.: refused', r.status === 409 && /already a supplier/.test(r.j.error) && r1.status === 400 && /not in the right format/.test(r1.j.error), [r.j, r1.j]);
    r = await act(US, 'vendorStatus', { id: vs.C.id, ver: vs.C.ver, status: 'Blocked', why: 'late' });
    ok('   a Purchase User cannot block a supplier', r.status === 403, r.j);
    r = await act(AD, 'vendorStatus', { id: vs.C.id, ver: vs.C.ver, status: 'Blocked', why: '' }); r1 = await act(AD, 'vendorStatus', { id: vs.C.id, ver: vs.C.ver, status: 'Blocked', why: 'Late deliveries twice' });
    ok('   the Purchase Admin blocks Chetan Hardware (why asked)', r.status === 400 && r1.status === 200 && r1.j.vendor.status === 'Blocked' && r1.j.vendor.status_note === 'Late deliveries twice', [r.j, r1.j]);
    r = await act(US, 'vendorSave', { id: vs.A.id, ver: 99, name: 'Asha Traders', phone: '9876543210' });
    ok('   a supplier changed on an old version: refused', r.status === 409 && r.j.code === 'changed', r.j);

    // ---- the Inbox: the Store's own figures (HO Purchase's list) ----
    r = await act(US, 'inbox'); r1 = await act(U2, 'inbox');
    const st = await signIn(ST, 'store', 'sujit@rcl.test', PW, 'T2'), ho = await st.req('/api/work', { action: 'purPending' });
    const hoLine = (site, req, line) => { const s = (ho.j.sites || []).find(x => x.site === site); const q = s && s.reqs.find(x => x.no === req); return q && q.lines.find(x => x.line === line); };
    ok('the Inbox of a Purchase User of S1: S1 only; approved requirement 9001 (Cement 100, TMT 500), 9003, 9004; the pending 9002 not', r.status === 200 && r.j.link === true && r.j.sites.map(s => s.site).join() === 'S1' &&
      lineOf(r.j, 'S1', 9001, 1).left === 100 && lineOf(r.j, 'S1', 9001, 2).left === 500 && !!lineOf(r.j, 'S1', 9003, 1) && !!lineOf(r.j, 'S1', 9004, 1) && !lineOf(r.j, 'S1', 9002, 1), r.j);
    ok('   one with S1 and T2: both sites (T2\'s Diesel Filter 4)', r1.j.sites.map(s => s.site).join() === 'S1,T2' && lineOf(r1.j, 'T2', 9001, 1).left === 4, r1.j.sites);
    ok('   the SAME figures as the Store\'s own HO Purchase list (purPending)', ho.status === 200 && [[ 'S1', 9001, 1], ['S1', 9001, 2], ['S1', 9003, 1], ['S1', 9004, 1], ['T2', 9001, 1]].every(([s, q, l]) => hoLine(s, q, l) && lineOf(r1.j, s, q, l) &&
      hoLine(s, q, l).left === lineOf(r1.j, s, q, l).left && hoLine(s, q, l).qty === lineOf(r1.j, s, q, l).qty && hoLine(s, q, l).ordered === lineOf(r1.j, s, q, l).ordered), ho.j);
    ok('   the Indent No. and the brand come with a line', /9001$/.test(r.j.sites[0].reqs.find(q => q.no === 9001).ref) && lineOf(r.j, 'S1', 9001, 1).brand === 'UltraTech', r.j.sites[0].reqs[0]);

    // ---- enquiries ----
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    const L = (site, req, line, qty) => ({ site: site, req_no: req, req_line: line, qty: qty });
    r = await act(US, 'rfqSave', { date: today, lines: [L('S1', 9001, 1, 101)], vendors: [vs.A.id, vs.B.id] });
    ok('an enquiry: more than is left – refused', r.status === 400 && /only 100 Bag is still to order/.test(r.j.error), r.j);
    r = await act(US, 'rfqSave', { date: today, lines: [L('T2', 9001, 1, 4)], vendors: [vs.A.id, vs.B.id] });
    ok('   a line of a site where he has no Purchase (T2) – refused', r.status === 403, r.j);
    r = await act(US, 'rfqSave', { date: today, lines: [L('S1', 9001, 1, 100)], vendors: [vs.A.id, vs.C.id] });
    ok('   a Blocked supplier – refused', r.status === 400 && /Blocked/.test(r.j.error), r.j);
    r = await act(US, 'rfqSave', { date: today, remark: 'Delivery at site, Ch 540', lines: [L('S1', 9001, 1, 100), L('S1', 9001, 2, 500)], vendors: [vs.A.id, vs.B.id] });
    const RFQ1 = r.j.rfq;
    ok('RFQ-0001 (Draft) by the Purchase User: Cement 100, TMT 500 from requirement 9001; Asha and Bharat asked', r.status === 200 && RFQ1.ref === 'RFQ-0001' && RFQ1.status === 'Draft' && RFQ1.site === 'S1' &&
      RFQ1.lines.map(l => [l.line, l.name, l.qty, l.site, l.req_no, l.req_line].join('|')).join() === '1|Cement OPC 53|100|S1|9001|1,2|TMT Bar 12 mm|500|S1|9001|2' && r.j.vendors.length === 2 && r.j.vendors[0].wa === '919876543210', r.j);
    r = await act(US, 'inbox');
    ok('   the Inbox shows the two lines in RFQ-0001 – not asked twice', lineOf(r.j, 'S1', 9001, 1).taken.rfq === 1 && lineOf(r.j, 'S1', 9001, 2).taken.status === 'Draft' && !lineOf(r.j, 'S1', 9003, 1).taken, r.j);
    r = await act(AD, 'rfqSave', { date: today, lines: [L('S1', 9001, 1, 10)], vendors: [vs.A.id, vs.B.id] });
    ok('   another enquiry with the same line – refused', r.status === 409 && /already in RFQ-0001/.test(r.j.error), r.j);
    r = await act(U2, 'rfqSave', { date: today, lines: [L('T2', 9001, 1, 4)], vendors: [vs.A.id, vs.B.id] });
    const RFQ2 = r.j.rfq;
    ok('RFQ-0002 by a Purchase User of S1 and T2 (signed in at S1): T2\'s Diesel Filter', r.status === 200 && RFQ2.ref === 'RFQ-0002' && RFQ2.lines[0].site === 'T2', r.j);
    r = await act(US, 'rfqList'); r1 = await act(US, 'rfqGet', { no: 2 });
    ok('   the Purchase User of S1 only does not see it (a line of T2)', r.j.rfqs.map(q => q.no).join() === '1' && r1.status === 403, [r.j.rfqs.map(q => q.ref), r1.j]);
    r = await act(US, 'quoteSave', { rfq: 1, vendor: vs.A.id, lines: [{ line: 1, rate: 100 }] });
    ok('   a quotation before the enquiry is sent – refused', r.status === 409 && /Mark RFQ-0001 as sent first/.test(r.j.error), r.j);
    r = await act(US, 'rfqSend', { no: 1, ver: RFQ1.ver });
    ok('RFQ-0001 marked as sent', r.status === 200 && r.j.rfq.status === 'Sent' && r.j.may.quote === true && r.j.may.send === false, r.j);

    // ---- quotations ----
    r = await act(US, 'quoteSave', { rfq: 1, vendor: vs.A.id, lines: [{ line: 1, rate: 100, disc: 10, gst: 28, days: 3 }, { line: 2, rate: 50, gst: 18, days: 5 }], freight: 150, loading: 40, pay_terms: '30 days credit', valid_till: '2026-12-31' });
    ok('Asha\'s quotation: Cement 100 less 10 %, TMT 50; freight 150, loading 40 – the enquiry is now "Quotes in"', r.status === 200 && r.j.quote.ver === 1 && r.j.rfq.status === 'Quotes in', r.j);
    r = await act(US, 'quoteSave', { rfq: 1, vendor: vs.A.id, ver: 1, lines: [{ line: 1, rate: 100, disc: 10, gst: 28, days: 3 }, { line: 2, rate: 50, gst: 18, days: 5 }], freight: 200, loading: 40, pay_terms: '30 days credit', valid_till: '2026-12-31' });
    ok('   changed (freight 200): the earlier version kept (history)', r.status === 200 && r.j.quote.ver === 2 && r.j.quote.history.length === 1 && Number(r.j.quote.history[0].freight) === 150, r.j.quote);
    r = await act(US, 'quoteSave', { rfq: 1, vendor: vs.A.id, ver: 1, lines: [{ line: 1, rate: 99 }] });
    ok('   on an old version – refused', r.status === 409 && r.j.code === 'changed', r.j);
    r = await act(US, 'quoteSave', { rfq: 1, vendor: vs.C.id, lines: [{ line: 1, rate: 80 }] });
    ok('   a supplier not asked – refused', r.status === 400 && /not asked/.test(r.j.error), r.j);
    r = await act(US, 'quoteSave', { rfq: 1, vendor: vs.B.id, lines: [{ line: 1, rate: 85, gst: 28 }, { line: 2, rate: 56, gst: 18 }] });
    ok('Bharat\'s quotation: Cement 85, TMT 56, no freight', r.status === 200, r.j);

    // ---- the CS ----
    r = await act(US, 'csMake', { rfq: 1 });
    let C1 = r.j.cs;
    const la = 90 * (1 + 240 / 34000), lb = 50 * (1 + 240 / 34000);
    const q11 = C1 && C1.sheet.lines[0].q, q12 = C1 && C1.sheet.lines[1].q;
    ok('CS-0001 made from the quotations: Asha\'s freight + loading (240) spread by value – Cement ' + r2(la) + ', TMT ' + r2(lb) + '; Bharat 85, 56', r.status === 200 && C1.ref === 'CS-0001' && C1.status === 'Draft' &&
      q11[vs.A.id].landed === r2(la) && q12[vs.A.id].landed === r2(lb) && q11[vs.B.id].landed === 85 && q12[vs.B.id].landed === 56, r.j);
    ok('   L1 per line WITHOUT GST: Cement – Bharat (85), TMT – Asha (' + r2(lb) + '); each line given to its L1 first (item-wise: two suppliers)', C1.sheet.lines[0].l1.join() === String(vs.B.id) && C1.sheet.lines[1].l1.join() === String(vs.A.id) &&
      Number(C1.award[1].vendor) === vs.B.id && Number(C1.award[2].vendor) === vs.A.id, C1.sheet.lines.map(L => L.l1));
    const tot1 = r2(85 * 100 + r2(lb) * 500), gst1 = r2(85 * 100 * 0.28 + 50 * 500 * 0.18);
    ok('   the total without GST ' + tot1 + ', GST beside ' + gst1 + '; up to ₹50,000: a Purchase Admin approves', C1.total === tot1 && C1.gst === gst1 && C1.need === 'admin' && C1.problems.length === 0, [C1.total, C1.gst, C1.need, C1.problems]);
    r = await act(US, 'csSave', { no: 1, version: C1.version, award: { 1: { vendor: vs.A.id }, 2: { vendor: vs.A.id } } });
    ok('   Cement given to Asha (not L1) without a reason: saved, but it says why it cannot go', r.status === 200 && r.j.cs.problems.some(p => /Line 1 .*not given to L1/.test(p)) && r.j.cs.may.send === false, r.j.cs && r.j.cs.problems);
    C1 = r.j.cs;
    r = await act(US, 'csSend', { no: 1, version: C1.version });
    ok('   sent so: refused – and the quotations stay open', r.status === 400 && /not given to L1/.test(r.j.error) && sql('rcl_pur', 'select count(*) from pur_quote where rfq_no = 1 and locked') === '0', r.j);
    r = await act(US, 'csSend', { no: 1, version: C1.version, award: { 1: { vendor: vs.B.id }, 2: { vendor: vs.A.id } } });
    C1 = r.j.cs;
    ok('CS-0001 sent for approval (each line to its L1): Sent, a Purchase Admin, the limit noted; the quotations locked', r.status === 200 && C1.status === 'Sent' && C1.need === 'admin' && C1.cs_limit === 50000 && C1.total === tot1 &&
      sql('rcl_pur', 'select count(*) from pur_quote where rfq_no = 1 and locked') === '2' && C1.trail.length === 1 && C1.trail[0].act === 'Sent', r.j);
    r = await act(US, 'quoteSave', { rfq: 1, vendor: vs.B.id, ver: 1, lines: [{ line: 1, rate: 1 }] }); r1 = await act(US, 'rfqSave', { no: 1, ver: 3, date: today, lines: [L('S1', 9001, 1, 100)], vendors: [vs.A.id, vs.B.id] });
    ok('   a quotation or the enquiry changed now – refused (locked)', r.status === 409 && r.j.code === 'locked' && r1.status === 409, [r.j, r1.j]);
    r = await act(US, 'csDecide', { no: 1, version: C1.version, act: 'approve' });
    ok('   a Purchase User cannot approve', r.status === 403, r.j);
    r = await act(AD, 'csList', { mine: 1 }); r1 = await act(AD2, 'csList', { mine: 1 });
    ok('Waiting for my approval: the Purchase Admin of S1 has CS-0001; signed in at T2 it is "another site" (open Purchase on S1)', r.j.list.map(c => c.ref).join() === 'CS-0001' && r1.j.list.length === 0 && r1.j.elsewhere.map(c => c.ref).join() === 'CS-0001', [r.j, r1.j]);
    r = await act(AD2, 'csDecide', { no: 1, version: C1.version, act: 'approve' });
    ok('   the same Admin signed in at T2: refused there', r.status === 403 && /open Purchase on S1/.test(r.j.error), r.j);
    r = await act(AD, 'csDecide', { no: 1, version: C1.version - 1, act: 'approve' });
    ok('   on an older version: refused (it is loaded again)', r.status === 409 && r.j.code === 'changed', r.j);
    // two decisions at the same moment: the Purchase Admin and the Super Admin – the first counts, the other is told
    const [d1, d2] = await Promise.all([act(AD, 'csDecide', { no: 1, version: C1.version, act: 'approve' }), act(SA, 'csDecide', { no: 1, version: C1.version, act: 'reject', why: 'Too costly' })]);
    const okOne = [d1, d2].filter(x => x.status === 200), noOne = [d1, d2].filter(x => x.status === 409);
    ok('two decisions on the same version at the same moment: exactly one counts, the other is refused ("decided by someone else")', okOne.length === 1 && noOne.length === 1 && /someone else/.test(noOne[0].j.error) &&
      sql('rcl_pur', "select jsonb_array_length(trail) from pur_cs where no = 1") === '2', [d1.status, d2.status, d1.j.error, d2.j.error]);
    const first = okOne[0].j.cs.status;
    if (first === 'Rejected') { ok('   (the Super Admin\'s rejection came first – RFQ-0001 Closed, its lines free again)', sql('rcl_pur', 'select status from pur_rfq where no = 1') === 'Closed'); }
    else {
      ok('   CS-0001 Approved by the Purchase Admin of S1 – RFQ-0001 Closed; the Inbox shows its lines "Awarded"', first === 'Approved' && sql('rcl_pur', 'select status from pur_rfq where no = 1') === 'Closed' && /approved/.test(sql('rcl_pur', 'select status_note from pur_rfq where no = 1')), okOne[0].j.cs);
      r = await act(US, 'inbox'); ok('      awarded lines: CS-0001', lineOf(r.j, 'S1', 9001, 1).taken.status === 'Awarded' && lineOf(r.j, 'S1', 9001, 1).taken.cs === 1, lineOf(r.j, 'S1', 9001, 1));
    }

    // ---- one quotation only (P2), the maker's own, sent back, corrected, approved ----
    r = await act(AD, 'rfqSave', { date: today, lines: [L('S1', 9003, 1, 30)], vendors: [vs.A.id, vs.B.id] }); const RFQ3 = r.j.rfq;
    await act(AD, 'rfqSend', { no: RFQ3.no, ver: RFQ3.ver });
    r = await act(AD, 'quoteSave', { rfq: RFQ3.no, vendor: vs.A.id, lines: [{ line: 1, rate: 1000, gst: 5 }] });
    r = await act(AD, 'csMake', { rfq: RFQ3.no }); let C3 = r.j.cs;
    ok('RFQ-0003 by the Purchase Admin: Sand 30 – one quotation only: the CS says the reason is needed', r.status === 200 && C3.ref === 'CS-0002' && C3.problems.some(p => /only 1 quotation – write why/.test(p)), C3 && C3.problems);
    r = await act(AD, 'csSend', { no: C3.no, version: C3.version });
    ok('   sent without the reason – refused', r.status === 400 && /only 1 quotation/.test(r.j.error), r.j);
    r = await act(AD, 'csSend', { no: C3.no, version: C3.version, few_reason: 'Only crusher near the site – Bharat gave no rate' }); C3 = r.j.cs;
    ok('   with the reason: sent – 30,000 (up to the limit: a Purchase Admin); the reason kept on the CS', r.status === 200 && C3.status === 'Sent' && C3.total === 30000 && C3.need === 'admin' && C3.few_reason === 'Only crusher near the site – Bharat gave no rate', r.j);
    r = await act(AD, 'csDecide', { no: C3.no, version: C3.version, act: 'approve' });
    ok('   its maker (the Purchase Admin) cannot approve his own CS', r.status === 403 && /his own/.test(r.j.error), r.j);
    r = await act(AD, 'csList', { mine: 1 });
    ok('   it is not in his "Waiting for my approval"', !r.j.list.some(c => c.no === C3.no), r.j.list);
    r = await act(SA, 'csDecide', { no: C3.no, version: C3.version, act: 'back', why: '' });
    r1 = await act(SA, 'csDecide', { no: C3.no, version: C3.version, act: 'back', why: 'Ask Asha for a better rate' }); C3 = r1.j.cs;
    ok('the Super Admin sends it back (why asked): Sent back; the quotations open again', r.status === 400 && r1.status === 200 && C3.status === 'Sent back' && sql('rcl_pur', 'select count(*) from pur_quote where rfq_no = ' + RFQ3.no + ' and locked') === '0', [r.j, r1.j]);
    r = await act(AD, 'quoteSave', { rfq: RFQ3.no, vendor: vs.A.id, ver: 1, lines: [{ line: 1, rate: 950, gst: 5 }] });
    r1 = await act(AD, 'csMake', { rfq: RFQ3.no, version: C3.version });
    ok('   the maker corrects the quotation (950) and works the CS out again: 28,500', r.status === 200 && r1.status === 200 && r1.j.cs.total === 28500 && r1.j.cs.status === 'Sent back', [r.j.error, r1.j.cs && r1.j.cs.total]);
    r = await act(AD, 'csSend', { no: C3.no, version: r1.j.cs.version }); C3 = r.j.cs;
    r = await act(SA, 'csDecide', { no: C3.no, version: C3.version, act: 'approve' }); C3 = r.j.cs;
    ok('   sent again and approved by the Super Admin: the decisions kept – Sent, Sent back, Sent, Approved', r.status === 200 && C3.status === 'Approved' && C3.trail.map(t => t.act).join() === 'Sent,Sent back,Sent,Approved' && C3.trail[1].why === 'Ask Asha for a better rate', C3 && C3.trail);

    // ---- above the limit: the Super Admin only; rejected – the line free again ----
    r = await act(US, 'rfqSave', { date: today, lines: [L('S1', 9004, 1, 10)], vendors: [vs.A.id, vs.B.id] }); const RFQ4 = r.j.rfq;
    await act(US, 'rfqSend', { no: RFQ4.no, ver: RFQ4.ver });
    await act(US, 'quoteSave', { rfq: RFQ4.no, vendor: vs.A.id, lines: [{ line: 1, rate: 45000, gst: 18 }] });
    await act(US, 'quoteSave', { rfq: RFQ4.no, vendor: vs.B.id, lines: [{ line: 1, rate: 46000, gst: 18 }], freight: 1000 });
    r = await act(US, 'csMake', { rfq: RFQ4.no }); let C4 = r.j.cs;
    r = await act(US, 'csSend', { no: C4.no, version: C4.version }); C4 = r.j.cs;
    ok('CS-0003: Bitumen 10 MT – 4,50,000 is above the limit: the Super Admin approves', r.status === 200 && C4.total === 450000 && C4.need === 'super', r.j);
    r = await act(AD, 'csDecide', { no: C4.no, version: C4.version, act: 'approve' }); r1 = await act(AD, 'csList', { mine: 1 });
    ok('   the Purchase Admin cannot (it is not in his list)', r.status === 403 && /Super Admin/.test(r.j.error) && !r1.j.list.some(c => c.no === C4.no), r.j);
    r = await act(SA, 'csList', { mine: 1 });
    ok('   in the Super Admin\'s "Waiting for my approval"', r.j.list.some(c => c.no === C4.no), r.j.list);
    r = await act(SA, 'csDecide', { no: C4.no, version: C4.version, act: 'reject', why: 'Buy through the bitumen contract instead' });
    r1 = await act(US, 'inbox');
    ok('   rejected (why kept): RFQ-0004 Closed; its line is free again in the Inbox', r.status === 200 && r.j.cs.status === 'Rejected' && sql('rcl_pur', 'select status from pur_rfq where no = ' + RFQ4.no) === 'Closed' && !lineOf(r1.j, 'S1', 9004, 1).taken, [r.j.cs && r.j.cs.status, lineOf(r1.j, 'S1', 9004, 1)]);
    r = await act(US, 'quoteSave', { rfq: RFQ4.no, vendor: vs.A.id, ver: 1, lines: [{ line: 1, rate: 1 }] });
    ok('   a rejected CS ends it: no quotation changed', r.status === 409, r.j);

    // ---- a cancelled enquiry ----
    r = await act(US, 'rfqCancel', { no: 2, ver: RFQ2.ver, why: 'not needed' }); r1 = await act(U2, 'rfqCancel', { no: 2, ver: RFQ2.ver, why: '' });
    const r4 = await act(U2, 'rfqCancel', { no: 2, ver: RFQ2.ver, why: 'T2 bought it locally' }), r5 = await act(U2, 'inbox');
    ok('RFQ-0002 cancelled by its maker (why asked; another person of S1 only – refused): T2\'s line free again', r.status === 403 && r1.status === 400 && r4.status === 200 && r4.j.rfq.status === 'Cancelled' && !lineOf(r5.j, 'T2', 9001, 1).taken, [r.j, r1.j, r4.j.rfq && r4.j.rfq.status]);

    // ---- every save in the activity record (with its site) ----
    const acts = sql('rcl_pur', "select string_agg(action || ':' || n, ',' order by action) from (select action, count(*) n from pur_activity where action <> 'Sign-in' group by action) x");
    ok('every save in pur_activity (with its site): ' + acts, ['CS approved', 'CS limit set', 'CS made', 'CS rejected', 'CS saved', 'CS sent back', 'CS sent for approval', 'CS worked out again', 'Enquiry cancelled', 'Enquiry made', 'Enquiry sent', 'Quotation changed', 'Quotation entered', 'Supplier added', 'Supplier blocked']
      .every(a => acts.indexOf(a + ':') > -1) && sql('rcl_pur', "select count(*) from pur_activity where site = '' or site is null") === '0', acts);
    ok('the numbers never given twice: RFQ 1–4, CS 1–3', sql('rcl_pur', "select string_agg(kind || '=' || next_no, ',' order by kind) from pur_numbers where kind in ('RFQ', 'CS')") === 'CS=4,RFQ=5', sql('rcl_pur', 'select * from pur_numbers'));

    // ---- the Store's door itself: only Purchase's signed question (the test knows the rig's made-up secret) ----
    const K = String(process.env.PUR_STORE_SECRET || '').trim();
    if (K.length >= 24) {
      const ask = async (key, ts, nonce, sites) => { const sig = crypto.createHmac('sha256', key).update(['rcl-pur-store', 'v1', ts, nonce, sites.join(',')].join('|')).digest('hex');
        const x = await fetch(ST + '/api/purinbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 1, ts: ts, nonce: nonce, sites: sites, sig: sig }), signal: AbortSignal.timeout(30000) });
        return { status: x.status, j: await x.json() }; };
      const before = Number(sql('rcl', "select count(*) from store_tickets where jti like 'pur-%'")), n1 = crypto.randomBytes(16).toString('hex');
      r = await ask(K, Date.now(), n1, ['S1']); r1 = await ask(K, Date.now(), n1, ['S1']);
      const w = await ask('wrong-secret-0123456789abcdefgh', Date.now(), crypto.randomBytes(16).toString('hex'), ['S1']), o = await ask(K, Date.now() - 6 * 60000, crypto.randomBytes(16).toString('hex'), ['S1']);
      ok('the Store\'s door: the signed question answered; the same nonce again, a wrong secret, an old time – refused (401)', r.status === 200 && r.j.sites[0].site === 'S1' && r1.status === 401 && r1.j.code === 'nonce' && w.status === 401 && w.j.code === 'sig' && o.status === 401 && o.j.code === 'time', [r.status, r1.j, w.j, o.j]);
      ok('   only the good question\'s nonce was noted (the first site\'s store_tickets)', Number(sql('rcl', "select count(*) from store_tickets where jti like 'pur-%'")) === before + 1);
      const b = await fetch(ST + '/api/purinbox', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RCL': '1' }, body: '{}' });
      ok('   a browser\'s call (no signature): refused', b.status === 400, b.status);
    } else out.push('NOTE the Store\'s door was not called directly (PUR_STORE_SECRET not given to this test)');
  } catch (e) { ok('the run finished', false, e.stack || String(e)); }
  finally {
    // put back what this test changed outside Purchase's own tables (rig only)
    sql('rcl', 'delete from store_req where no between 9001 and 9010;'); sql('rcl_s2', 'delete from store_req where no between 9001 and 9010;');
    sql('rcl_portal', "delete from access where module = 'store' and email = 'sujit@rcl.test' and site = 'T2';");
    JSON.parse(accBefore).filter(a => a.module === 'store').forEach(a => sql('rcl_portal', "insert into access (email, site, module, role, granted_by, pages) values ('" + a.email + "', '" + a.site + "', 'store', '" + a.role + "', 'test', " + (a.pages ? "'" + JSON.stringify(a.pages) + "'" : 'null') + ") on conflict do nothing;"));
  }
  console.log(out.join('\n'));
  console.log('\nTOTAL ' + pass + ' passed, ' + fail + ' failed  (' + Math.round((Date.now() - T0) / 1000) + ' s)');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(out.join('\n')); console.error('CRASH', e); process.exit(2); });
