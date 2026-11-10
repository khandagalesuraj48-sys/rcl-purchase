/* PURCHASE PHASE 1 in the browser, on the local rig (never live): the Portal :3010 → Purchase :3050 (step 2 applied), the Store :3020 –
 * both servers with the same made-up PUR_STORE_SECRET (their start command only). Run after test/api.test.js (Purchase in the Portal).
 *       timeout 400 node test/rfqcs.browser.test.js      (pictures in test/shots/)
 * A Purchase User ticks requirement lines in the Inbox → makes an enquiry with two suppliers → its WhatsApp link and print → marks it sent
 * → types both quotations → makes the CS (L1 marked, the award line by line, a reason when not L1) → sends it; the Purchase Admin
 * approves it from "Waiting for my approval"; the Super Admin's Settings (the limit); a supplier added on the page; a phone's width.
 * It sets its own start (rig only): Purchase's step-2 tables emptied, approved requirements 9001 put in S1 (taken out at the end). */
'use strict';
const M = '/home/claude/test/node_modules/';
const chromium = require(M + '@sparticuz/chromium').default || require(M + '@sparticuz/chromium'); const puppeteer = require(M + 'puppeteer-core');
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const P = 'http://127.0.0.1:3010', U = 'http://127.0.0.1:3050';
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const out = [];
const ok = (n, c, x) => { c ? pass++ : fail++; out.push((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && !c ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600) : '')); };
const sql = (db, q) => execSync('timeout 60 su postgres -c "psql -d ' + db + ' -tA -q"', { input: q }).toString().trim();
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { const v = await fn(); if (v) return v; } catch (e) { /* changing */ } await wait(250); } return null; };
const PW = 'Nashik#Road848!', VPW = 'Audit#PassView9!x';
const REQ = (no, st, lines) => "(" + no + ", current_date - 2, current_date + 10, 'Site work', 'Rig – Purchase Phase 1 (browser)', '', '" + JSON.stringify(lines) + "', '" + st + "', 0, '[]', 'view@rcl.test', 'View User')";

(async () => {
  if (sql('rcl_portal', "select count(*) from access where module = 'purchase'") === '0') { console.log('Run test/api.test.js first.'); process.exit(1); }
  sql('rcl_portal', "delete from counters; update users set start_item = null where email in ('sujit@rcl.test', 'view@rcl.test');");
  sql('rcl_pur', "truncate public.pur_cs, public.pur_quote, public.pur_rfq, public.pur_vendors restart identity cascade; delete from public.pur_numbers where kind in ('RFQ', 'CS'); " +
    "insert into public.pur_settings (site, id, value, updated_by) values ('*', 'cs_limit', '{\"amount\": 50000}', 'sa@rcl.test') on conflict (site, id) do update set value = excluded.value; " +
    "insert into public.pur_vendors (site, name, name_key, gstin, pan, phone, supplies, created_by, created_name, updated_by) values ('*', 'Asha Traders', 'ashatraders', '27ABCDE1234F1Z5', 'ABCDE1234F', '9876543210', '[\"Cement\", \"Steel\"]', 'test', 'Test', 'test'), " +
    "('*', 'Bharat Steel', 'bharatsteel', '', '', '9822012345', '[\"Steel\"]', 'test', 'Test', 'test');");
  const VA = sql('rcl_pur', "select id from pur_vendors where name = 'Asha Traders'"), VB = sql('rcl_pur', "select id from pur_vendors where name = 'Bharat Steel'");
  sql('rcl', 'delete from store_req where no between 9001 and 9010; insert into store_req (no, date, need_by, for_kind, for_text, remark, lines, status, level, approvals, created_by, created_name) values ' +
    REQ(9001, 'Approved', [{ line: 1, code: 'ITM-0001', name: 'Cement OPC 53', unit: 'Bag', qty: 100, brand: 'UltraTech' }, { line: 2, code: 'ITM-0002', name: 'TMT Bar 12 mm', unit: 'Kg', qty: 500 }]) + ';');
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--no-sandbox'], headless: 'shell', protocolTimeout: 120000 });
  const errs = [];
  async function open(email, pw, view) {
    const ctx = await b.createBrowserContext(), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(email + ': ' + String(e.message).slice(0, 200)));
    await p.setViewport(view || { width: 1440, height: 900 });
    await p.goto(U + '/', { waitUntil: 'load' });
    await until(() => p.url().startsWith(P) && p.evaluate(() => !document.getElementById('v_login').hidden));
    await p.waitForFunction(() => document.activeElement && document.activeElement.id === 'l_email', { timeout: 20000 });
    await p.type('#l_email', email); await p.type('#l_pass', pw); await p.click('#l_btn');
    const where = await until(() => p.url().startsWith(U) ? 'pur' : p.evaluate(() => !document.getElementById('v_home').hidden ? 'home' : ''), 30000);
    if (where === 'home') await p.evaluate(() => { const a = [...document.querySelectorAll('#h_sites a.mod')].find(x => /module=purchase&site=S1/.test(x.getAttribute('href'))); if (a) a.click(); });
    else if (where !== 'pur') await p.goto(P + '/api/go?module=purchase&site=S1', { waitUntil: 'load' });      // (the Super Admin lands on the Portal's console)
    await until(() => p.url().startsWith(U) && p.evaluate(() => document.body.dataset.loaded === 'dashboard'), 30000);
    return p;
  }
  const page = async (p, k) => { await p.evaluate(k => { const x = document.querySelector('#pur_pages [data-page="' + k + '"]'); if (x) x.click(); }, k); return until(() => p.evaluate(k => document.body.dataset.loaded === k, k), 30000); };
  const dlg = (p, label) => until(() => p.evaluate(l => { const d = document.getElementById('dlg'); if (d.hidden) return false; const x = [...document.querySelectorAll('#dlg_btns button')].find(y => y.textContent === l); if (x) { x.click(); return true; } return false; }, label), 10000);
  const act = (p, sel) => p.evaluate(s => { const x = document.querySelector(s); if (x) x.click(); return !!x; }, sel);
  const text = (p, sel) => p.evaluate(s => { const x = document.querySelector(s); return x ? x.innerText : ''; }, sel);
  try {
    // ---- a Purchase User: the Inbox → an enquiry ----
    const V = await open('view@rcl.test', VPW);
    const menu = await V.evaluate(() => [...document.querySelectorAll('#pur_pages .navbtn')].map(x => x.textContent));
    ok('a Purchase User\'s menu: Dashboard, Inbox, Enquiries, Quotations, Comparative Statement, Purchase Orders (Phase 2), Suppliers', menu.join() === 'Dashboard,Inbox,Enquiries,Quotations,Comparative Statement,Purchase Orders,Suppliers', menu);
    ok('the 🎙 of every typed box is on the page (voice.js – as the Store and Engineering)', await V.evaluate(() => !!window.RclVoice && window.RclVoice.toNumber('साडे तीन हजार') === '3500'));
    ok('the Inbox opens', !!(await page(V, 'inbox')));
    const rows = await until(() => V.evaluate(() => { const t = [...document.querySelectorAll('#in_body tr')].map(r => r.innerText); return t.some(x => /Cement OPC 53/.test(x)) ? t : null; }), 20000);
    ok('   the approved requirement 9001 of S1: Cement OPC 53 – 100 Bag, TMT Bar 12 mm – 500 Kg, each with its tick', !!rows && rows.some(x => /Cement OPC 53/.test(x) && /100\s*Bag/.test(x)) && !!(await V.$('#in_body input[data-k="S1:9001:1"]')) && !!(await V.$('#in_body input[data-k="S1:9001:2"]')), rows);
    await V.click('#in_body input[data-k="S1:9001:1"]'); await V.click('#in_body input[data-k="S1:9001:2"]');
    ok('   two ticked → Make enquiry', /2 lines ticked/.test(await text(V, '#in_bar')));
    await V.screenshot({ path: path.join(SHOTS, 'pur_inbox.png') });
    await act(V, '[data-act="inMake"]');
    await until(() => V.evaluate(() => document.body.dataset.loaded === 'rfq' && !document.getElementById('rf_form').hidden), 20000);
    const form = await V.evaluate(() => ({ lines: [...document.querySelectorAll('#rf_lines tr')].map(r => r.innerText), vs: [...document.querySelectorAll('#rf_vs label')].map(l => l.innerText) }));
    ok('the enquiry form: the two lines from the Inbox; the Approved suppliers to pick', form.lines.length === 2 && /Cement OPC 53/.test(form.lines[0]) && form.vs.some(t => /Asha Traders/.test(t)) && form.vs.some(t => /Bharat Steel/.test(t)), form);
    await V.click('#rf_vs input[data-vid="' + VA + '"]'); await V.click('#rf_vs input[data-vid="' + VB + '"]');
    await V.type('#rf_rem', 'Delivery at site');
    await V.screenshot({ path: path.join(SHOTS, 'pur_rfq_form.png') });
    await act(V, '[data-act="rfSave"]');
    const view = await until(() => V.evaluate(() => { const v = document.getElementById('rf_view'); return !v.hidden && /RFQ-0001/.test(v.innerText) ? v.innerText : null; }), 20000);
    ok('saved: RFQ-0001 Draft, its lines and the two suppliers', !!view && /Draft/.test(view) && /Asha Traders/.test(view) && /Bharat Steel/.test(view), view);
    const wa = await V.evaluate(() => [...document.querySelectorAll('#rf_view a[data-wa]')].map(a => a.getAttribute('href')));
    const t0 = decodeURIComponent((wa[0] || '').split('?text=')[1] || '');
    ok('   Share on WhatsApp: a wa.me link to the supplier\'s mobile with the enquiry as its text (no e-mail)', wa.length === 2 && /^https:\/\/wa\.me\/919876543210\?text=/.test(wa[0]) && /Request for Quotation RFQ-0001/.test(t0) && /1\. Cement OPC 53 – UltraTech: 100 Bag/.test(t0) && /2\. TMT Bar 12 mm: 500 Kg/.test(t0), [wa, t0]);
    await act(V, '[data-act="rfPrint"]');
    const paper = await until(() => V.evaluate(() => { const f = [...document.querySelectorAll('iframe')].pop(); return f && f.contentDocument && /REQUEST FOR QUOTATION/.test(f.contentDocument.body.innerText) ? f.contentDocument.body.innerText : null; }), 5000);
    ok('   its print: one page for each supplier – REQUEST FOR QUOTATION, RFQ-0001, the lines', !!paper && (paper.match(/REQUEST FOR QUOTATION/g) || []).length === 2 && /Cement OPC 53/.test(paper) && /Asha Traders/.test(paper), paper);
    await act(V, '[data-act="rfSend"]'); await dlg(V, 'Mark as sent');
    ok('Mark as sent (asked first): Sent', !!(await until(() => V.evaluate(() => /RFQ-0001\s*Sent/.test(document.getElementById('rf_view').innerText)), 15000)));
    await V.screenshot({ path: path.join(SHOTS, 'pur_rfq_view.png') });

    // ---- the quotations ----
    await act(V, '#rf_view [data-act="rfQuote"][data-v="' + VA + '"]');
    await until(() => V.evaluate(() => document.body.dataset.loaded === 'quotes' && !document.getElementById('qt_form').hidden), 20000);
    const fill = async (line, f, v) => { await V.click('#qt_form input[data-f="' + f + '"][data-line="' + line + '"]', { clickCount: 3 }); await V.type('#qt_form input[data-f="' + f + '"][data-line="' + line + '"]', String(v)); };
    await fill(1, 'rate', 100); await fill(1, 'disc', 10); await fill(1, 'gst', 28); await fill(2, 'rate', 50); await fill(2, 'gst', 18);
    await V.type('#qt_fr', '200'); await V.type('#qt_ld', '40');
    const sum = await text(V, '#qt_sum');
    ok('Asha\'s quotation typed: net rate and amount worked out on the page – lines ₹34,000.00 + freight and loading ₹240.00 = ₹34,240.00 without GST', /Lines ₹34,000\.00 \+ freight and loading ₹240\.00 = ₹34,240\.00 without GST · GST beside: ₹7,020\.00/.test(sum), sum);
    await V.screenshot({ path: path.join(SHOTS, 'pur_quote.png') });
    await act(V, '[data-act="qtSave"]');
    ok('   saved', !!(await until(() => V.evaluate(() => /Entered/.test(document.querySelector('#qt_form h2').innerText)), 15000)));
    await V.select('#qt_v', VB);
    await until(() => V.evaluate(() => /Bharat Steel/.test(document.querySelector('#qt_form h2').innerText)), 15000);
    await fill(1, 'rate', 85); await fill(1, 'gst', 28); await fill(2, 'rate', 56); await fill(2, 'gst', 18);
    await act(V, '[data-act="qtSave"]');
    ok('Bharat\'s quotation saved (the supplier picked in the list)', !!(await until(() => V.evaluate(() => /Bharat Steel.*Entered/.test(document.querySelector('#qt_form h2').innerText)), 15000)));

    // ---- the comparative statement ----
    await page(V, 'cs'); await V.select('#cs_rfq', '1');
    await until(() => V.evaluate(() => !!document.querySelector('#cs_body [data-act="csMake"]')), 15000);
    await act(V, '#cs_body [data-act="csMake"]');
    const cs = await until(() => V.evaluate(() => { const t = document.querySelector('#cs_body table.cs'); return t ? { l1: [...t.querySelectorAll('td.l1')].map(td => td.dataset.cell), tags: t.querySelectorAll('.tag').length, tot: document.getElementById('cs_tot').textContent,
      need: document.getElementById('cs_need').textContent, sel: [...document.querySelectorAll('#cs_body select[data-aw]')].map(s => s.value), heads: [...t.querySelectorAll('thead th')].map(h => h.textContent) } : null; }), 20000);
    ok('CS-0001 side by side: both suppliers; L1 marked – Cement Bharat (85), TMT Asha (50.35); each line given to its L1', !!cs && cs.heads.indexOf('Asha Traders') > -1 && cs.heads.indexOf('Bharat Steel') > -1 && cs.l1.join() === '1:' + VB + ',2:' + VA && cs.sel.join() === VB + ',' + VA, cs);
    ok('   the total without GST ₹33,675.00 – approves: a Purchase Admin of S1 (up to ₹50,000.00)', !!cs && cs.tot === '₹33,675.00' && /Purchase Admin of S1 \(up to ₹50,000\.00\)/.test(cs.need), cs);
    await V.select('#cs_body select[data-aw="1"]', VA);
    const nl1 = await V.evaluate(() => ({ why: !document.querySelector('#cs_body input[data-why="1"]').hidden, prob: document.getElementById('cs_prob').innerText, send: document.querySelector('#cs_body [data-act="csSend"]').disabled, tot: document.getElementById('cs_tot').textContent }));
    ok('   Cement given to Asha (not L1): "Why" asked, Send held back; the total follows (₹34,239.00)', nl1.why && /not given to L1 – write why/.test(nl1.prob) && nl1.send && nl1.tot === '₹34,239.00', nl1);
    await V.type('#cs_body input[data-why="1"]', 'Same supplier – one delivery');
    ok('   with the reason: Send for approval allowed', await V.evaluate(() => !document.querySelector('#cs_body [data-act="csSend"]').disabled && document.getElementById('cs_prob').innerText === ''));
    await V.select('#cs_body select[data-aw="1"]', VB);
    await V.screenshot({ path: path.join(SHOTS, 'pur_cs.png') });
    await act(V, '#cs_body [data-act="csSend"]'); await dlg(V, 'Send for approval');
    const sent = await until(() => V.evaluate(() => { const t = document.getElementById('cs_body').innerText; return /CS-0001 · RFQ-0001\s*Sent/.test(t) ? t : null; }), 15000);
    ok('sent for approval: Sent, read-only, waiting for a Purchase Admin of S1; the decision kept', !!sent && !(await V.$('#cs_body select[data-aw]')) && /Waiting for a Purchase Admin of S1/.test(sent) && /Decisions/.test(sent), sent && sent.slice(0, 400));
    // ---- a phone's width: the page never wider than the phone (the CS scrolls inside its box) ----
    await V.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });      // (a new "phone" reloads the page: the CS is opened again)
    await until(() => V.evaluate(() => document.body.dataset.loaded === 'cs' && !!document.getElementById('cs_rfq')), 20000);
    await V.select('#cs_rfq', '1');
    const ph = await until(() => V.evaluate(() => document.querySelector('#cs_body table.cs') ? { page: document.documentElement.scrollWidth, view: window.innerWidth, box: document.querySelector('#cs_body .tw').scrollWidth > document.querySelector('#cs_body .tw').clientWidth } : null), 20000);
    ok('a phone\'s width: the CS open, nothing wider than the phone (the comparison scrolls inside its own box)', !!ph && ph.page <= ph.view + 1 && ph.box, ph);
    await V.screenshot({ path: path.join(SHOTS, 'pur_cs_phone.png') });

    // ---- the Purchase Admin approves ----
    const A = await open('sujit@rcl.test', PW);
    ok('the Purchase Admin: "Waiting for my approval" in his menu', !!(await page(A, 'approve')));
    const list = await until(() => A.evaluate(() => { const t = document.getElementById('ap_body').innerText; return /CS-0001/.test(t) ? t : null; }), 15000);
    ok('   CS-0001 waits for him – ₹33,675.00', !!list && /₹33,675\.00/.test(list), list);
    await act(A, '#ap_body [data-act="apOpen"]');
    await until(() => A.evaluate(() => document.body.dataset.loaded === 'cs' && !!document.querySelector('#cs_body [data-act="csDec"][data-d="approve"]')), 20000);
    await act(A, '#cs_body [data-act="csDec"][data-d="approve"]'); await dlg(A, 'Approve');
    ok('   Approve (asked first): Approved', !!(await until(() => A.evaluate(() => /CS-0001 · RFQ-0001\s*Approved/.test(document.getElementById('cs_body').innerText)), 15000)));
    await A.screenshot({ path: path.join(SHOTS, 'pur_cs_approved.png') });
    // ---- a supplier added on the page (the PAN from the GST no.) ----
    await page(A, 'vendors'); await act(A, '[data-act="vnNew"]');
    await A.type('#vn_nm', 'Ganesh Cement Agency'); await A.type('#vn_gs', '27AAAPG1234C1Z9'); await A.focus('#vn_ph'); await A.type('#vn_ph', '9890011122'); await A.type('#vn_sp', 'Cement');
    const pan = await A.evaluate(() => document.getElementById('vn_pn').value);
    await act(A, '[data-act="vnSave"]');
    const vrow = await until(() => A.evaluate(() => { const r = [...document.querySelectorAll('#vn_list tr')].find(x => /Ganesh Cement Agency/.test(x.innerText)); return r ? r.innerText : null; }), 15000);
    ok('Suppliers: added on the page; the PAN filled from the GST no.; Approved; Block offered to the Admin', pan === 'AAAPG1234C' && !!vrow && /AAAPG1234C/.test(vrow) && /Approved/.test(vrow) && /Block/.test(vrow), [pan, vrow]);
    await A.screenshot({ path: path.join(SHOTS, 'pur_vendors.png') });
    // ---- the Super Admin's Settings ----
    // (the rig's Super Admin: one of its two test passwords, as test/api.test.js)
    const saPw = (await fetch(P + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-RCL': '1' }, body: JSON.stringify({ action: 'login', email: 'sa@rcl.test', password: 'Super#Admin2040' }) })).status === 200 ? 'Super#Admin2040' : 'Super#Admin2041';
    const S = await open('sa@rcl.test', saPw);
    ok('the Super Admin: Settings in his menu – the limit now ₹50,000.00', !!(await page(S, 'settings')) && /₹50,000\.00/.test(await text(S, '#se_now')));
    await S.click('#se_lim', { clickCount: 3 }); await S.type('#se_lim', '75000'); await act(S, '[data-act="seSave"]');
    ok('   set to ₹75,000.00', !!(await until(() => S.evaluate(() => /₹75,000\.00/.test(document.getElementById('se_now').innerText)), 15000)) && sql('rcl_pur', "select value->>'amount' from pur_settings where id = 'cs_limit'") === '75000');
    await S.screenshot({ path: path.join(SHOTS, 'pur_settings.png') });
    ok('no script error on any page', errs.length === 0, errs);
  } catch (e) { ok('the run finished', false, e.stack || String(e)); }
  finally { await b.close(); sql('rcl', 'delete from store_req where no between 9001 and 9010;'); }
  console.log(out.join('\n'));
  console.log('\nTOTAL ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(out.join('\n')); console.error('CRASH', e); process.exit(2); });
