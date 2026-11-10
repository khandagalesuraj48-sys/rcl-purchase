/* PURCHASE PHASE 2 – PURCHASE ORDERS in the browser, on the local rig (never live): the Portal :3010 → Purchase :3050 (steps 2 and 3
 * applied), the Store :3020 (its step 10 applied in S1 / T2) – both servers with the same made-up PUR_STORE_SECRET (their start command
 * only).   timeout 500 node test/po.browser.test.js      (pictures in test/shots/: po_*.png – a desktop and a phone)
 * The approved CS (made through Purchase's own door) → a Purchase User opens it: its POs one a supplier × site → Make PO (the site's
 * address from its Store, a GST % not quoted typed) → the PO at the site at once; its view, Share on WhatsApp, its paper (the company's
 * PO – the Store's look); the list; a phone's width; the Store's own Purchase Orders page shows it "From Purchase" – read-only; the
 * Purchase Admin cancels the other PO (why asked). It sets its own start (rig only) and takes out what it put in S1 at the end. */
'use strict';
const M = '/home/claude/test/node_modules/';
const chromium = require(M + '@sparticuz/chromium').default || require(M + '@sparticuz/chromium'); const puppeteer = require(M + 'puppeteer-core');
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const P = 'http://127.0.0.1:3010', U = 'http://127.0.0.1:3050', ST = 'http://127.0.0.1:3020';
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const out = [];
const ok = (n, c, x) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !c ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 700) : '')); };
const sql = (db, q) => execSync('timeout 60 su postgres -c "psql -d ' + db + ' -tA -q"', { input: q }).toString().trim();
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { const v = await fn(); if (v) return v; } catch (e) { /* changing */ } await wait(250); } return null; };
const PW = 'Nashik#Road848!', VPW = 'Audit#PassView9!x';
function client(base) {
  let cookie = '';
  const req = async (p, body) => {
    const h = { 'Content-Type': 'application/json', 'X-RCL': '1' }; if (cookie) h.Cookie = cookie;
    const r = await fetch(base + p, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(60000) });
    const sc = r.headers.get('set-cookie'); if (sc) { const v = sc.split(';')[0]; cookie = /=$/.test(v) ? '' : v; }
    let j = {}; try { j = JSON.parse(await r.text()); } catch (e) { j = {}; }
    return { status: r.status, j: j, loc: r.headers.get('location') || '' };
  };
  return { req };
}
async function portalAs(email, pw) {
  const p = client(P); let l = await p.req('/api/auth', { action: 'login', email: email, password: pw });
  if (l.status !== 200 && email === 'sa@rcl.test') l = await p.req('/api/auth', { action: 'login', email: email, password: 'Super#Admin2040' });
  if (l.status !== 200) throw new Error('Portal sign-in of ' + email + ': ' + JSON.stringify(l.j));
  return p;
}
async function purAs(email, pw, site) { const p = await portalAs(email, pw), s = client(U), t = (await p.req('/api/go?module=purchase&site=' + site)).loc.split('#sso=')[1] || ''; const r = await s.req('/api/sso', { ticket: t }); if (r.status !== 200) throw new Error(JSON.stringify(r.j)); return s; }
const act = (c, a, x) => c.req('/api/pur', Object.assign({ action: a }, x || {}));
const REQ = (no, lines) => "(" + no + ", current_date - 2, current_date + 10, 'Site work', 'Rig – Purchase Phase 2 (browser)', '', '" + JSON.stringify(lines) + "', 'Approved', 0, '[]', 'view@rcl.test', 'View User')";
const ITEM = (code, name, unit, gst) => "('" + code + "', '" + name + "', '" + name.toLowerCase().replace(/[^a-z0-9]+/g, '') + "', '" + unit + "', 'P2 Test', " + gst + ", 'Active', 'test')";
const clean = () => sql('rcl', "delete from store_grn_lines where grn_no in (select g.no from store_grn g join store_po p on p.no = g.po_no where p.pur_no is not null); delete from store_grn where po_no in (select no from store_po where pur_no is not null); " +
  "delete from store_po where pur_no is not null; delete from store_req where no between 9001 and 9010; delete from items where code like 'ITM-98__';");

(async () => {
  // ---- the start (rig only): Purchase's tables, S1's items and requirement, the access; the approved CS through Purchase's own door ----
  sql('rcl_portal', "insert into modules (key, name, url, status, sort) values ('purchase', 'Purchase', 'http://127.0.0.1:3050', 'live', 4) on conflict (key) do update set url = excluded.url, status = 'live'; " +
    "delete from access where module = 'purchase'; insert into access (email, site, module, role, granted_by) values ('sujit@rcl.test', 'S1', 'purchase', 'admin', 'test'), ('sujit@rcl.test', 'T2', 'purchase', 'admin', 'test'), " +
    "('store@rcl.test', 'S1', 'purchase', 'user', 'test'); delete from counters; update users set start_item = null where email in ('sujit@rcl.test', 'store@rcl.test');");
  sql('rcl_pur', "truncate public.pur_po, public.pur_cs, public.pur_quote, public.pur_rfq, public.pur_vendors restart identity; delete from public.pur_numbers where kind in ('RFQ', 'CS', 'PO'); " +
    "insert into public.pur_settings (site, id, value, updated_by) values ('*', 'cs_limit', '{\"amount\": 50000}', 'sa@rcl.test') on conflict (site, id) do update set value = excluded.value;");
  clean();
  sql('rcl', "insert into items (code, name, name_key, unit, category, gst_pct, status, created_by) values " + [ITEM('ITM-9801', 'P2 Cement PPC', 'Bag', 28), ITEM('ITM-9802', 'P2 TMT Bar 16 mm', 'Kg', 18)].join(', ') + ";" +
    "insert into store_req (no, date, need_by, for_kind, for_text, remark, lines, status, level, approvals, created_by, created_name) values " +
    REQ(9001, [{ line: 1, code: 'ITM-9801', name: 'P2 Cement PPC', unit: 'Bag', qty: 100, brand: 'UltraTech', spec: 'PPC' }, { line: 2, code: 'ITM-9802', name: 'P2 TMT Bar 16 mm', unit: 'Kg', qty: 500 }]) + ';');
  const SAP = await portalAs('sa@rcl.test', 'Super#Admin2041');
  await SAP.req('/api/admin', { action: 'rulesSave', site: 'S1', ho: { req: true, grn: false, iss: false } });
  const US = await purAs('store@rcl.test', VPW, 'S1'), AD = await purAs('sujit@rcl.test', PW, 'S1'), today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const VA = (await act(US, 'vendorSave', { name: 'Asha Traders', gstin: '27ABCDE1234F1Z5', phone: '9876543210', address: 'Nashik Road, Nashik' })).j.vendor.id, VB = (await act(US, 'vendorSave', { name: 'Bharat Steel', phone: '9822012345' })).j.vendor.id;
  let r = await act(US, 'rfqSave', { date: today, lines: [{ site: 'S1', req_no: 9001, req_line: 1, qty: 100 }, { site: 'S1', req_no: 9001, req_line: 2, qty: 500 }], vendors: [VA, VB] }); const RFQ = r.j.rfq;
  await act(US, 'rfqSend', { no: RFQ.no, ver: RFQ.ver });
  await act(US, 'quoteSave', { rfq: RFQ.no, vendor: VA, lines: [{ line: 1, rate: 100, disc: 10, gst: 28 }, { line: 2, rate: 50 }], freight: 200, loading: 40, pay_terms: '30 days credit' });
  await act(US, 'quoteSave', { rfq: RFQ.no, vendor: VB, lines: [{ line: 1, rate: 85, gst: 28 }, { line: 2, rate: 56, gst: 18 }] });
  let C = (await act(US, 'csMake', { rfq: RFQ.no })).j.cs; C = (await act(US, 'csSend', { no: C.no, version: C.version })).j.cs; C = (await act(AD, 'csDecide', { no: C.no, version: C.version, act: 'approve' })).j.cs;
  if (!C || C.status !== 'Approved') { console.log('The start could not be made: ' + JSON.stringify(C)); process.exit(1); }
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--no-sandbox'], headless: 'shell', protocolTimeout: 120000 });
  const errs = [];
  async function open(email, pw, mod, site, view) {
    const ctx = await b.createBrowserContext(), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(email + ': ' + String(e.message).slice(0, 200)));
    await p.setViewport(view || { width: 1440, height: 900 });
    await p.goto(P + '/', { waitUntil: 'load' }); await p.waitForSelector('#l_email', { visible: true });
    let st = await p.evaluate(async (e, x) => (await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-RCL': '1' }, body: JSON.stringify({ action: 'login', email: e, password: x }) })).status, email, pw);
    if (st !== 200) throw new Error('the Portal sign-in of ' + email + ': ' + st);
    await p.goto(P + '/api/go?module=' + mod + '&site=' + site + (mod === 'store' ? '&page=po' : ''), { waitUntil: 'load' });
    if (mod === 'purchase') await until(() => p.url().startsWith(U) && p.evaluate(() => document.body.dataset.loaded === 'dashboard'), 30000);
    else { await until(() => p.url().startsWith(ST) && p.evaluate(() => !document.getElementById('v_app').hidden), 30000); await wait(1800); }
    return p;
  }
  const page = async (p, k) => { await p.evaluate(k => { const x = document.querySelector('#pur_pages [data-page="' + k + '"]'); if (x) x.click(); }, k); return until(() => p.evaluate(k => document.body.dataset.loaded === k, k), 30000); };
  const dlg = (p, label) => until(() => p.evaluate(l => { const d = document.getElementById('dlg'); if (d.hidden) return false; const x = [...document.querySelectorAll('#dlg_btns button')].find(y => y.textContent === l); if (x) { x.click(); return true; } return false; }, label), 10000);
  const act2 = (p, sel) => p.evaluate(s => { const x = document.querySelector(s); if (x) x.click(); return !!x; }, sel);
  const text = (p, sel) => p.evaluate(s => { const x = document.querySelector(s); return x ? x.innerText : ''; }, sel);
  try {
    // ---- a Purchase User: the approved CS → its POs → Make PO ----
    const V = await open('store@rcl.test', VPW, 'purchase', 'S1');
    const menu = await V.evaluate(() => [...document.querySelectorAll('#pur_pages .navbtn')].map(x => x.textContent));
    ok('the menu: Purchase Orders after the Comparative Statement', menu.join() === 'Dashboard,Inbox,Enquiries,Quotations,Comparative Statement,Purchase Orders,Suppliers', menu);
    await page(V, 'cs'); await V.select('#cs_rfq', String(RFQ.no));
    const pos = await until(() => V.evaluate(() => { const s = document.getElementById('cs_pos'); return s ? s.innerText : null; }), 20000);
    ok('the approved CS-0001: "Purchase orders of CS-0001" – Asha × S1 (TMT, its GST % to be entered) and Bharat × S1 (Cement), each Make PO', !!pos && /Purchase orders of CS-0001/.test(pos) && /Asha Traders\s+S1/.test(pos) && /Bharat Steel\s+S1/.test(pos) && /GST % to be entered on 1 line/.test(pos) &&
      (await V.$$('#cs_pos [data-act="poNew"]')).length === 2, pos);
    await V.screenshot({ path: path.join(SHOTS, 'po_cs_pos.png') });
    await act2(V, '#cs_pos [data-act="poNew"][data-v="' + VA + '"]');
    const form = await until(() => V.evaluate(() => { const f = document.getElementById('po_ship'); return f ? { ship: f.value, pay: document.getElementById('po_pay').value, gst: !!document.querySelector('#po_lines input[data-gst]'), sum: document.getElementById('po_sum').innerText, terms: document.getElementById('po_terms').value } : null; }), 20000);
    const want = JSON.parse(sql('rcl', "select value::text from store_settings where id = 'papers'") || '{}');
    ok('the PO form: the site\'s shipping address and terms from its Store, his payment terms, a box for the GST % he did not give – "enter the GST %"', !!form && form.pay === '30 days credit' && form.ship === (want.ship_to || '') && form.terms === (want.terms || '') && form.gst && /enter the GST % of 1 line/.test(form.sum), [form, want.ship_to]);
    await V.type('#po_lines input[data-gst]', '18'); await V.type('#po_rem', 'Deliver in two lots');
    const sum = await text(V, '#po_sum');
    ok('   the GST % typed: the total follows – Amount ₹25,000.00 + GST ₹4,500.00 + freight + loading', /Amount ₹25,000\.00 \+ GST ₹4,500\.00 \+ freight ₹/.test(sum) && !/enter the GST/.test(sum), sum);
    await V.screenshot({ path: path.join(SHOTS, 'po_form.png') });
    await act2(V, '[data-act="poSave"]'); await dlg(V, 'Make the PO');
    const view = await until(() => V.evaluate(() => { const v = document.getElementById('po_view'); return document.body.dataset.loaded === 'po' && v && !v.hidden && /PO-0001/.test(v.innerText) ? v.innerText : null; }), 30000);
    ok('saved: the Purchase Orders page with PO-0001 – At the site (its PO there named), the lines with Came / Balance', !!view && /PO-0001\s*At the site/.test(view) && /At the site in its Store as PO \d+/.test(view) && /Came/i.test(view) && /Balance/i.test(view) && /Deliver in two lots/.test(view), view && view.slice(0, 600));
    const wa = await V.evaluate(() => (document.querySelector('#po_view a[data-wa]') || {}).href || ''), wt = decodeURIComponent(wa.split('?text=')[1] || '');
    ok('   Share on WhatsApp: a wa.me link to Asha\'s mobile with the PO as its text (no e-mail)', /^https:\/\/wa\.me\/919876543210\?text=/.test(wa) && /Purchase Order PO-0001/.test(wt) && /1\. P2 TMT Bar 16 mm: 500 Kg @ ₹50\.00 · GST 18\.00%/.test(wt) && /Payment terms: 30 days credit/.test(wt), [wa.slice(0, 60), wt]);
    await V.screenshot({ path: path.join(SHOTS, 'po_view.png') });
    await act2(V, '[data-act="poPrint"]');
    const paper = await until(() => V.evaluate(() => { const f = [...document.querySelectorAll('iframe')].pop(); return f && f.contentDocument && /Purchase Order/.test(f.contentDocument.body.innerText) ? { t: f.contentDocument.body.innerText, img: !!f.contentDocument.querySelector('img.plogo') } : null; }), 12000);
    ok('   its paper – the company\'s PO (the Store\'s look): the logo, Supplier Details, PO Details (PO-0001, payment terms, the site\'s PO no.), the lines, TOTAL AMOUNT and Amount in word, Approved By (the CS\'s approver)', !!paper && paper.img &&
      ['Supplier Details', 'PO Details', 'PO-0001', 'Payment Terms', 'Site PO No.', 'Shipping Address', 'P2 TMT Bar 16 mm', 'TOTAL AMOUNT (Rs.)', 'Amount in word', 'Sujit Test', 'Approved By'].every(x => paper.t.indexOf(x) > -1), paper && paper.t.slice(0, 900));
    // the other PO (through the door) – the list with both
    r = await act(US, 'poNew', { cs: C.no, vendor: VB, site: 'S1' });
    r = await act(US, 'poMake', { cs: C.no, vendor: VB, site: 'S1', date: today, pay_terms: r.j.start.pay_terms, ship_to: r.j.start.ship_to, site_contact: r.j.start.site_contact, terms: r.j.start.terms });
    await V.evaluate(() => { const s = document.getElementById('po_st'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
    const list = await until(() => V.evaluate(() => { const t = document.getElementById('po_list').innerText; return /PO-0002/.test(t) ? t : null; }), 15000);
    ok('the list: PO-0002 (Bharat) and PO-0001 (Asha), each with its site, CS and state', !!list && /PO-0002/.test(list) && /PO-0001/.test(list) && (list.match(/At the site/g) || []).length === 2 && /CS-0001/.test(list), list);
    await V.screenshot({ path: path.join(SHOTS, 'po_list.png'), fullPage: true });
    // ---- a phone's width: the PO open, nothing wider than the phone ----
    await V.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await until(() => V.evaluate(() => document.body.dataset.loaded === 'po'), 20000);
    await V.evaluate(() => { const x = document.querySelector('#po_list [data-act="poOpen"]'); if (x) x.click(); });
    const ph = await until(() => V.evaluate(() => { const v = document.getElementById('po_view'); return v && !v.hidden && /PO-000/.test(v.innerText) ? { page: document.documentElement.scrollWidth, view: window.innerWidth } : null; }), 20000);
    ok('a phone\'s width: the PO open, nothing wider than the phone (its tables scroll inside their boxes)', !!ph && ph.page <= ph.view + 1, ph);
    await V.screenshot({ path: path.join(SHOTS, 'po_view_phone.png') });

    // ---- the site's own Store: its Purchase Orders page shows them "From Purchase" – read-only ----
    const S = await open('sujit@rcl.test', PW, 'store', 'S1');
    const srow = await until(() => S.evaluate(() => { const rows = [...document.querySelectorAll('#po_list tr[data-po]')].filter(tr => /From Purchase/.test(tr.innerText)); return rows.length >= 2 ? rows.map(tr => ({ t: tr.innerText, edit: !!tr.querySelector('.po-edit, .po-cancel, .po-del, .po-close, .po-ok'), det: !!tr.querySelector('.po-det') })) : null; }), 20000);
    ok('the Store\'s Purchase Orders page at S1 (its Store Admin): both "From Purchase – PO-000n", approved in Purchase; no Change / Cancel / Delete / Close / Approve – Details and Print only', !!srow && srow.every(x => !x.edit && x.det) && srow.some(x => /From Purchase – PO-0001/.test(x.t)) && srow.some(x => /Approved in Purchase by Sujit Test/.test(x.t)), srow);
    await S.screenshot({ path: path.join(SHOTS, 'po_store_page.png') });

    // ---- the Purchase Admin cancels PO-0002 (nothing came): why asked ----
    const A = await open('sujit@rcl.test', PW, 'purchase', 'S1');
    await page(A, 'po');
    await A.evaluate(() => { const x = [...document.querySelectorAll('#po_list tr')].find(tr => /PO-0002/.test(tr.innerText)); if (x) x.querySelector('[data-act="poOpen"]').click(); });
    await until(() => A.evaluate(() => !!document.querySelector('#po_view [data-act="poCancel"]')), 20000);
    await act2(A, '#po_view [data-act="poCancel"]');
    await until(() => A.evaluate(() => !!document.getElementById('why_t')), 10000); await wait(300);      // (the dialog puts the focus on its button first)
    await A.type('#why_t', 'Bharat cannot deliver this month'); await dlg(A, 'Cancel PO');
    const cv = await until(() => A.evaluate(() => { const v = document.getElementById('po_view').innerText; return /PO-0002\s*Cancelled/.test(v) ? v : null; }), 20000);
    ok('the Purchase Admin: Cancel PO (why asked) – PO-0002 Cancelled; its copy at the site Cancelled too', !!cv && /Bharat cannot deliver this month/.test(cv) && sql('rcl', 'select status from store_po where pur_no = 2') === 'Cancelled', cv && cv.slice(0, 400));
    await A.screenshot({ path: path.join(SHOTS, 'po_cancelled.png') });
    ok('the 🎙 is on the page for the PO form\'s boxes (voice.js – every typed box)', await A.evaluate(() => !!window.RclVoice));
    ok('no script error on any page', errs.length === 0, errs);
  } catch (e) { ok('the run finished', false, e.stack || String(e)); }
  finally { await b.close(); try { clean(); } catch (e) { out.push('NOTE clean-up: ' + e.message); } }
  console.log(out.join('\n'));
  console.log('\nTOTAL ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(out.join('\n')); console.error('CRASH', e); process.exit(2); });
