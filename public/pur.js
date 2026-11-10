/* PURCHASE PHASE 1 – the pages (09-11-2026): Inbox (the sites' approved requirement lines still to order – from the Store), Enquiries
 * (RFQ: made from the Inbox, the suppliers asked, its print and "Share on WhatsApp" – no e-mail), Quotations (each supplier's, typed as he
 * gave it), Comparative Statement (side by side WITHOUT GST, GST beside, L1 marked, the award line by line), Waiting for my approval,
 * Suppliers, Settings (the Super Admin's CS limit). Written fresh for RCL. The same look and sign-in as the Dashboard (index.html gives
 * its kit: window.RP). Every save is checked again by the server (api/pur.js). Simple screens: a list, and what is opened above it. */
(function () {
  'use strict';
  const K = () => window.RP;
  const $ = id => document.getElementById(id), esc = s => K().esc(s);
  const P = (action, x) => K().api('api/pur', Object.assign({ action: action }, x || {}));
  const toast = (t, bad) => K().toast(t, bad), failed = e => K().failed(e), ask = (t, h, b, w) => K().ask(t, h, b, w);
  const me = () => K().S.me, role = () => (me() && me().user.role) || '', isAdmin = () => role() === 'admin' || role() === 'super', isSuper = () => role() === 'super';
  const money = v => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const a2 = v => v === '' || v === null || v === undefined ? '' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n3 = v => v === '' || v === null || v === undefined ? '' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
  const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const dmy = d => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '';
  const dmyAt = t => { const d = Date.parse(t); return isNaN(d) ? dmy(t) : new Date(d + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ').replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3-$2-$1'); };
  const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const rfqRef = n => 'RFQ-' + String(n).padStart(4, '0'), csRef = n => 'CS-' + String(n).padStart(4, '0');
  const key = (site, req, line) => site + ':' + req + ':' + line;
  const numOf = v => { const s = String(v === undefined || v === null ? '' : v).trim().replace(/,/g, ''); return s === '' ? null : Number(s); };
  const TAG = { Draft: 'off', Sent: 'blue', 'Quotes in': 'warn', Closed: '', Cancelled: 'bad', Approved: '', 'Sent back': 'warn', Rejected: 'bad', Blocked: 'bad', Awarded: '' };
  const tag = st => '<span class="tag ' + (TAG[st] || '') + '">' + esc(st) + '</span>';
  const errbox = t => '<div class="errbox">' + esc(t) + '</div>';
  const ST = { pick: new Map(), rfqForm: null, rfqNo: 0, q: { rfq: 0, vendor: 0 }, cs: { rfq: 0 }, vForm: null, vendors: null };
  // a page's frame, made once
  function frame(page, html) { const s = $('pg_' + page); if (!s.dataset.ready) { s.innerHTML = html; s.dataset.ready = '1'; } return s; }
  // a paper printed (an A4 page made here – the page itself is not printed; as the Store's papers)
  function printHtml(title, html) {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>@page{size:A4 portrait;margin:12mm}body{font:12px Arial,sans-serif;color:#000}h1{font-size:18px;margin:0}h2{font-size:15px;margin:10px 0 4px}' +
      'table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #444;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}td.n,th.n{text-align:right}.muted{color:#555}.hd{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px}.pg{page-break-after:always}.pg:last-child{page-break-after:auto}.sign{margin-top:36px;text-align:right}</style></head><body>' + html + '</body></html>');
    d.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Could not print here.', true); } setTimeout(() => f.remove(), 60000); }, 250);
  }

  /* ====================== INBOX – the approved requirement lines of his sites still to order ====================== */
  async function inbox() {
    frame('inbox', '<section class="panel"><h2>Inbox – to order</h2><p class="muted" style="margin:0">The approved Material Requirements of your sites still to order (from each site\'s Store). Tick the lines, then <b>Make enquiry</b>. ' +
      'A line already in an enquiry is shown with it – it is not asked twice. <span class="mr">मंजूर requirement च्या ओळी – निवडा आणि Enquiry बनवा.</span></p>' +
      '<div class="bar" id="in_bar"></div></section><div id="in_body"></div>');
    const box = $('in_body'); box.innerHTML = '<p class="muted">Reading the approved requirements of your sites from the Store…</p>';
    const r = await P('inbox');
    if (!r.link) { box.innerHTML = errbox(r.error); bar(); return; }
    const free = new Set(); r.sites.forEach(st => st.reqs.forEach(q => q.lines.forEach(l => { if (!l.taken) free.add(key(st.site, q.no, l.line)); })));
    [...ST.pick.keys()].forEach(k => { if (!free.has(k)) ST.pick.delete(k); });
    ST.inbox = r;
    box.innerHTML = r.sites.map(st => {
      const n = st.reqs.reduce((a, q) => a + q.lines.length, 0);
      return '<section class="panel"><h2>' + esc(st.name) + ' <span class="sidebadge">' + esc(st.site) + '</span></h2>' +
        (st.own ? '<p class="muted">This site buys its requirements itself (Portal → Workflow: not to Head Office) – none of them comes here.</p>' : '') + (st.error ? (/^No Store at this site/.test(st.error) ? '<p class="muted">' + esc(st.error) + '</p>' : errbox(st.error)) : '') +
        (!st.own && !st.error && !n ? '<p class="empty">Nothing to order – every approved requirement is ordered.</p>' : '') +
        (n ? '<div class="tw"><table><thead><tr><th></th><th>Indent No.</th><th>Item</th><th>Brand / Specification</th><th class="n">To order</th><th>Need by</th><th>Waiting since</th><th>Made by</th><th>Enquiry</th></tr></thead><tbody>' +
          st.reqs.map(q => q.lines.map(l => { const k = key(st.site, q.no, l.line), t = l.taken;
            return '<tr' + (t ? ' class="off"' : '') + '><td>' + (t ? '' : '<input type="checkbox" data-k="' + esc(k) + '"' + (ST.pick.has(k) ? ' checked' : '') + ' aria-label="Pick ' + esc(l.name) + '">') + '</td>' +
              '<td>' + esc(q.ref) + '<small>' + esc(q.for_kind + (q.for_text ? ' – ' + q.for_text : '')) + '</small></td><td class="nm">' + esc(l.name) + '<small>' + esc(l.code) + '</small></td>' +
              '<td class="wrap">' + esc([l.brand, l.spec].filter(Boolean).join(' · ')) + '</td><td class="n"><b>' + n3(l.left) + '</b> ' + esc(l.unit) + (Number(l.ordered) ? '<small>of ' + n3(l.qty) + ' · ordered ' + n3(l.ordered) + '</small>' : '') + '</td>' +
              '<td>' + dmy(q.need_by) + '</td><td>' + dmy(q.since) + '</td><td>' + esc(q.made_by) + '</td><td>' + (t ? '<span class="tag ' + (t.status === 'Awarded' ? '' : 'warn') + '">' + esc(rfqRef(t.rfq)) + ' · ' + esc(t.status) + '</span>' : '') + '</td></tr>'; }).join('')).join('') +
          '</tbody></table></div>' : '') + '</section>';
    }).join('') || '<p class="empty">You have Purchase on no site with a Store.</p>';
    bar();
  }
  function bar() {
    const n = ST.pick.size;
    $('in_bar').innerHTML = '<span class="muted"><b>' + n + '</b> line' + (n === 1 ? '' : 's') + ' ticked</span><button type="button" class="btn primary" data-act="inMake"' + (n ? '' : ' disabled') + '>Make enquiry</button>' + (n ? '<button type="button" class="btn small" data-act="inClear">Clear</button>' : '');
  }
  function inboxLine(k) {
    const [site, req, line] = k.split(':'); const st = (ST.inbox.sites || []).find(x => x.site === site); if (!st) return null;
    const q = st.reqs.find(x => String(x.no) === req); const l = q && q.lines.find(x => String(x.line) === line); if (!l) return null;
    return { site: site, req_no: q.no, req_line: l.line, qty: l.left, left: l.left, name: l.name, code: l.code, unit: l.unit, ref: q.ref, brand: l.brand, spec: l.spec, need_by: q.need_by };
  }
  document.addEventListener('change', e => {
    const c = e.target.closest('#pg_inbox input[type=checkbox][data-k]'); if (!c) return;
    if (c.checked) { const l = inboxLine(c.dataset.k); if (l) ST.pick.set(c.dataset.k, l); } else ST.pick.delete(c.dataset.k);
    bar();
  });

  /* ====================== ENQUIRIES (RFQ) ====================== */
  async function rfqPage() {
    frame('rfq', '<section class="panel" id="rf_form" hidden></section><section class="panel" id="rf_view" hidden></section>' +
      '<section class="panel"><h2>Enquiries (RFQ)</h2><div class="bar"><div class="field"><label for="rf_st">Show</label><select id="rf_st"><option value="">All</option><option>Draft</option><option>Sent</option><option>Quotes in</option><option>Closed</option><option>Cancelled</option></select></div>' +
      '<button type="button" class="btn" data-act="rfFromInbox">New enquiry – from the Inbox</button></div><div id="rf_list"></div></section>');
    await rfqList();
    if (ST.rfqForm) { await rfqFormDraw(); return; }
    $('rf_form').hidden = true;
    if (ST.rfqNo) await rfqOpen(ST.rfqNo); else $('rf_view').hidden = true;
  }
  async function rfqList() {
    const r = await P('rfqList', { status: $('rf_st').value || undefined });
    $('rf_list').innerHTML = r.rfqs.length ? '<div class="tw"><table><thead><tr><th>RFQ No.</th><th>Date</th><th>Need by</th><th>Items</th><th class="n">Lines</th><th>Suppliers</th><th class="n">Quotations</th><th>CS</th><th>Status</th><th></th></tr></thead><tbody>' +
      r.rfqs.map(q => '<tr><td><b>' + esc(q.ref) + '</b><small>' + esc(q.sites.join(', ')) + '</small></td><td>' + dmy(q.date) + '</td><td>' + dmy(q.need_by) + '</td><td class="wrap">' + esc(q.items) + '</td><td class="n">' + q.nlines + '</td>' +
        '<td class="wrap">' + esc(q.vendors.map(v => v.name).join(', ')) + '</td><td class="n">' + q.quotes + ' of ' + q.vendors.length + '</td><td>' + (q.cs ? esc(q.cs.ref) + ' ' + tag(q.cs.status) : '') + '</td><td>' + tag(q.status) + '</td>' +
        '<td><button type="button" class="link" data-act="rfOpen" data-no="' + q.no + '">Open</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="empty">No enquiry yet – make one from the Inbox.</p>';
  }
  async function rfqOpen(no) {
    const r = await P('rfqGet', { no: no }); ST.rfqNo = no; ST.rfq = r;
    const q = r.rfq, m = r.may, box = $('rf_view'); box.hidden = false; $('rf_form').hidden = true;
    box.innerHTML = '<div class="bar" style="margin-top:0;justify-content:space-between;align-items:flex-start"><div><h2>' + esc(q.ref) + ' ' + tag(q.status) + '</h2><div class="muted">Date ' + dmy(q.date) + (q.need_by ? ' · need by ' + dmy(q.need_by) : '') +
      ' · made by ' + esc(q.created_name) + ' · site ' + esc(q.site) + (q.sent_at ? ' · sent ' + dmyAt(q.sent_at) : '') + '</div>' + (q.status_note ? '<div class="muted">' + esc(q.status_note) + '</div>' : '') + (q.remark ? '<div>Remark: ' + esc(q.remark) + '</div>' : '') + '</div>' +
      '<div class="acts">' + (m.edit ? '<button type="button" class="btn small" data-act="rfEdit">Change</button>' : '') + (m.send ? '<button type="button" class="btn small primary" data-act="rfSend">Mark as sent</button>' : '') +
      '<button type="button" class="btn small" data-act="rfPrint">Print</button>' + (m.cs ? '<button type="button" class="btn small primary" data-act="rfCs">' + (r.cs ? 'Open ' + esc(r.cs.ref) : 'Make the CS') + '</button>' : r.cs ? '<button type="button" class="btn small" data-act="rfCs">Open ' + esc(r.cs.ref) + '</button>' : '') +
      (m.cancel ? '<button type="button" class="btn small bad" data-act="rfCancel">Cancel enquiry</button>' : '') + '<button type="button" class="btn small" data-act="rfHide">Close</button></div></div>' +
      '<h3>Lines</h3><div class="tw"><table><thead><tr><th>#</th><th>Item</th><th>From</th><th>Brand / Specification</th><th class="n">Qty</th><th>Unit</th></tr></thead><tbody>' +
      q.lines.map(l => '<tr><td>' + l.line + '</td><td class="nm">' + esc(l.name) + '<small>' + esc(l.code) + '</small></td><td>' + esc(l.ref) + '<small>' + esc(l.site) + ' · requirement line ' + l.req_line + '</small></td><td class="wrap">' + esc([l.brand, l.spec].filter(Boolean).join(' · ')) + '</td><td class="n">' + n3(l.qty) + '</td><td>' + esc(l.unit) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<h3>Suppliers asked</h3>' + (r.vendors.length < 2 ? '<p class="muted">Only one supplier asked – at least 2 quotations an item (P2), or the CS needs a reason.</p>' : '') +
      '<div class="tw"><table><thead><tr><th>Supplier</th><th>Phone</th><th>Quotation</th><th></th></tr></thead><tbody>' +
      r.vendors.map(v => '<tr><td class="nm">' + esc(v.name) + (v.status === 'Blocked' ? ' ' + tag('Blocked') : '') + '<small>' + esc(v.gstin) + '</small></td><td>' + esc(v.phone) + '</td><td>' + (v.quote ? '<span class="tag">Entered</span><small>' + esc(v.quote.by) + ' · ' + dmyAt(v.quote.at) + (v.quote.locked ? ' · locked' : '') + '</small>' : '<span class="muted">not yet</span>') + '</td>' +
        '<td><div class="acts"><a class="btn small" target="_blank" rel="noopener" href="' + esc(waLink(q, v)) + '" data-wa="' + v.id + '">Share on WhatsApp</a>' + (m.quote ? '<button type="button" class="btn small" data-act="rfQuote" data-v="' + v.id + '">' + (v.quote ? 'Change quotation' : 'Enter quotation') + '</button>' : v.quote ? '<button type="button" class="btn small" data-act="rfQuote" data-v="' + v.id + '">See quotation</button>' : '') + '</div></td></tr>').join('') + '</tbody></table></div>';
  }
  // the enquiry as one WhatsApp message (the person taps it – WhatsApp opens with the text; nothing is sent by the server)
  function waText(q, v) {
    return ['*Rachana Construction Limited – Request for Quotation ' + q.ref + '*', 'Date: ' + dmy(q.date) + (q.need_by ? ' · Needed by: ' + dmy(q.need_by) : ''), 'To: ' + v.name, '', 'Please quote your best rates for:']
      .concat(q.lines.map((l, i) => (i + 1) + '. ' + l.name + (l.brand ? ' – ' + l.brand : '') + (l.spec ? ' (' + l.spec + ')' : '') + ': ' + n3(l.qty) + ' ' + l.unit))
      .concat(['', 'Please give: rate per unit, discount %, GST %, delivery days, freight and loading, payment terms, validity.'].concat(q.remark ? ['Note: ' + q.remark] : [])).join('\n');
  }
  const waLink = (q, v) => 'https://wa.me/' + (v.wa || '') + '?text=' + encodeURIComponent(waText(q, v));
  function rfqPrint() {
    const r = ST.rfq, q = r.rfq;
    const one = v => '<div class="pg"><div class="hd"><div><h1>Rachana Construction Limited</h1><div class="muted">Purchase Department</div></div><div style="text-align:right"><h2 style="margin:0">REQUEST FOR QUOTATION</h2><b>' + esc(q.ref) + '</b><br>Date: ' + dmy(q.date) + (q.need_by ? '<br>Needed by: ' + dmy(q.need_by) : '') + '</div></div>' +
      '<p><b>To:</b> ' + esc(v.name) + (v.address ? '<br>' + esc(v.address) : '') + (v.phone ? '<br>Phone: ' + esc(v.phone) : '') + (v.gstin ? '<br>GSTIN: ' + esc(v.gstin) : '') + '</p><p>Please quote your best rates for the following:</p>' +
      '<table><thead><tr><th>S.N.</th><th>Item Description – Specification</th><th>Brand</th><th class="n">Qty</th><th>Unit</th><th class="n">Rate</th><th class="n">Disc. %</th><th class="n">GST %</th><th class="n">Delivery days</th></tr></thead><tbody>' +
      q.lines.map((l, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(l.name) + (l.spec ? '<br><span class="muted">' + esc(l.spec) + '</span>' : '') + '</td><td>' + esc(l.brand) + '</td><td class="n">' + n3(l.qty) + '</td><td>' + esc(l.unit) + '</td><td></td><td></td><td></td><td></td></tr>').join('') +
      '</tbody></table><p>Freight: ________ &nbsp; Loading / unloading: ________ &nbsp; Payment terms: ____________ &nbsp; Valid till: ________</p>' + (q.remark ? '<p><b>Remark:</b> ' + esc(q.remark) + '</p>' : '') +
      '<div class="sign">For Rachana Construction Limited<br><br>' + esc(me().user.name) + '</div></div>';
    printHtml(q.ref, (r.vendors.length ? r.vendors : [{ name: '' }]).map(one).join(''));
  }
  async function rfqFormDraw() {
    const f = ST.rfqForm, box = $('rf_form'); box.hidden = false; $('rf_view').hidden = true;
    ST.vendors = (await P('vendorList')).vendors;
    box.innerHTML = '<h2>' + (f.no ? 'Change ' + esc(rfqRef(f.no)) : 'New enquiry (RFQ)') + '</h2>' +
      '<div class="grid"><div class="field"><label for="rf_date">Date</label><input type="date" id="rf_date" value="' + esc(f.date) + '" max="' + today() + '"></div><div class="field"><label for="rf_need">Need by</label><input type="date" id="rf_need" value="' + esc(f.need_by || '') + '"></div>' +
      '<div class="field wide"><label for="rf_rem">Remark (printed on it)</label><input id="rf_rem" maxlength="300" value="' + esc(f.remark || '') + '"></div></div>' +
      '<h3>Lines</h3><div class="tw"><table><thead><tr><th>#</th><th>Item</th><th>From</th><th class="n">Qty</th><th>Unit</th><th></th></tr></thead><tbody id="rf_lines"></tbody></table></div>' +
      '<h3>Suppliers to ask <span class="muted" id="rf_vn"></span></h3><div class="bar"><div class="field grow"><label for="rf_vq">Find a supplier (name or what he supplies)</label><input id="rf_vq" autocomplete="off"></div></div><div class="pick" id="rf_vs"></div>' +
      '<p class="muted" style="margin:6px 0 0">At least 2 suppliers – P2: at least 2 quotations an item. A new supplier: Suppliers → Add. <span class="mr">किमान 2 पुरवठादार निवडा.</span></p>' +
      '<div class="acts" style="margin-top:14px"><button type="button" class="btn primary" data-act="rfSave">Save enquiry</button><button type="button" class="btn" data-act="rfClose">Cancel</button></div>';
    rfLines(); rfVendors();
  }
  function rfLines() {
    const f = ST.rfqForm;
    $('rf_lines').innerHTML = f.lines.map((l, i) => '<tr><td>' + (i + 1) + '</td><td class="nm">' + esc(l.name) + '<small>' + esc(l.code) + (l.brand ? ' · ' + esc(l.brand) : '') + '</small></td><td>' + esc(l.ref) + '<small>' + esc(l.site) + '</small></td>' +
      '<td class="n"><input class="num" inputmode="decimal" data-ln="' + i + '" value="' + esc(l.qty) + '" aria-label="Quantity of ' + esc(l.name) + '">' + (l.left !== undefined ? '<small>at most ' + n3(l.left) + '</small>' : '') + '</td><td>' + esc(l.unit) + '</td>' +
      '<td><button type="button" class="link del" data-act="rfDrop" data-i="' + i + '">Remove</button></td></tr>').join('') || '<tr><td colspan="6" class="empty">No line – add them from the Inbox.</td></tr>';
  }
  function rfVendors() {
    const f = ST.rfqForm, q = String(($('rf_vq') || {}).value || '').toLowerCase().trim();
    const list = ST.vendors.filter(v => (v.status === 'Approved' || f.vendors.has(v.id)) && (!q || (v.name + ' ' + (v.supplies || []).join(' ')).toLowerCase().indexOf(q) > -1));
    $('rf_vs').innerHTML = list.map(v => '<label class="' + (f.vendors.has(v.id) ? 'on' : '') + '"><input type="checkbox" data-vid="' + v.id + '"' + (f.vendors.has(v.id) ? ' checked' : '') + '>' + esc(v.name) + ((v.supplies || []).length ? ' <small class="muted">' + esc(v.supplies.slice(0, 3).join(', ')) + '</small>' : '') + '</label>').join('') || '<span class="muted">No supplier found – add one in Suppliers.</span>';
    $('rf_vn').textContent = '(' + f.vendors.size + ' picked)';
  }
  document.addEventListener('input', e => {
    if (e.target.id === 'rf_vq') rfVendors();
    const ln = e.target.closest('#rf_lines input[data-ln]'); if (ln) ST.rfqForm.lines[Number(ln.dataset.ln)].qty = ln.value;
    if (e.target.closest('#qt_form [data-f], #qt_form [data-w]')) qtSum();
    if (e.target.closest('#cs_body [data-why], #cs_body #cs_few')) csLive();
  });
  document.addEventListener('change', e => {
    const v = e.target.closest('#rf_vs input[data-vid]'); if (v) { const id = Number(v.dataset.vid); if (v.checked) ST.rfqForm.vendors.add(id); else ST.rfqForm.vendors.delete(id); rfVendors(); }
    if (e.target.id === 'rf_st') rfqList().catch(failed);
    if (e.target.id === 'qt_rfq') { ST.q = { rfq: Number(e.target.value) || 0, vendor: 0 }; quotes().catch(failed); }
    if (e.target.id === 'qt_v') { ST.q.vendor = Number(e.target.value) || 0; quotes().catch(failed); }
    if (e.target.id === 'cs_rfq') { ST.cs = { rfq: Number(e.target.value) || 0 }; csPage().catch(failed); }
    if (e.target.closest('#cs_body select[data-aw]')) csLive();
  });

  /* ====================== QUOTATIONS – each supplier's, as he gave it ====================== */
  async function quotes() {
    frame('quotes', '<section class="panel"><h2>Quotations</h2><p class="muted" style="margin:0">Pick the enquiry and the supplier, and type his quotation as he gave it: rate per unit, discount %, GST %, delivery days; freight and loading of the whole quotation. ' +
      'A line he did not quote: leave its rate empty. Every change is kept. <span class="mr">पुरवठादाराचे दर जसे दिले तसे भरा.</span></p>' +
      '<div class="bar"><div class="field grow"><label for="qt_rfq">Enquiry</label><select id="qt_rfq"></select></div><div class="field grow"><label for="qt_v">Supplier</label><select id="qt_v"></select></div></div></section><section class="panel" id="qt_form" hidden></section>');
    const l = (await P('rfqList')).rfqs.filter(q => ['Sent', 'Quotes in'].indexOf(q.status) > -1 || q.no === ST.q.rfq);
    if (ST.q.rfq && !l.some(q => q.no === ST.q.rfq)) ST.q = { rfq: 0, vendor: 0 };
    $('qt_rfq').innerHTML = '<option value="">– pick an enquiry –</option>' + l.map(q => '<option value="' + q.no + '"' + (q.no === ST.q.rfq ? ' selected' : '') + '>' + esc(q.ref + ' · ' + q.items + ' · ' + q.status) + '</option>').join('');
    if (!ST.q.rfq) { $('qt_v').innerHTML = ''; $('qt_form').hidden = true; if (!l.length) $('qt_form').hidden = true; return; }
    const r = await P('rfqGet', { no: ST.q.rfq });
    if (!r.vendors.some(v => v.id === ST.q.vendor)) ST.q.vendor = 0;
    $('qt_v').innerHTML = '<option value="">– pick the supplier –</option>' + r.vendors.map(v => '<option value="' + v.id + '"' + (v.id === ST.q.vendor ? ' selected' : '') + '>' + esc(v.name + (v.quote ? ' ✓ entered' : '')) + '</option>').join('');
    if (!ST.q.vendor) { $('qt_form').hidden = true; return; }
    await qtForm();
  }
  async function qtForm() {
    const r = await P('quoteGet', { rfq: ST.q.rfq, vendor: ST.q.vendor }); ST.qt = r;
    const q = r.quote || {}, by = {}, ro = !r.may.save, box = $('qt_form'); box.hidden = false;
    (q.lines || []).forEach(l => { by[l.line] = l; });
    const inp = (l, f, w) => ro ? esc(by[l.line] && by[l.line][f] !== null && by[l.line][f] !== undefined ? by[l.line][f] : '') : '<input class="num' + (w ? ' sm' : '') + '" inputmode="decimal" data-f="' + f + '" data-line="' + l.line + '" value="' + esc(by[l.line] && by[l.line][f] !== null && by[l.line][f] !== undefined ? by[l.line][f] : '') + '" aria-label="' + f + ' of line ' + l.line + '">';
    const whole = (id, label, v, extra) => '<div class="field"><label for="' + id + '">' + label + '</label>' + (ro ? '<div>' + esc(v === null || v === undefined ? '' : v) + '</div>' : '<input id="' + id + '" data-w="1" value="' + esc(v === null || v === undefined ? '' : v) + '"' + (extra || '') + '>') + '</div>';
    box.innerHTML = '<h2>' + esc(r.vendor.name) + ' · ' + esc(r.rfq.ref) + (r.quote ? ' <span class="tag">Entered</span>' : '') + '</h2>' +
      (ro ? '<p class="muted">' + (r.cs && ['Sent', 'Approved', 'Rejected'].indexOf(r.cs.status) > -1 ? 'Locked – its CS ' + esc(r.cs.ref) + ' is ' + esc(r.cs.status.toLowerCase()) + '.' : r.rfq.status === 'Draft' ? 'Mark the enquiry as sent first.' : 'Not changed now (' + esc(r.rfq.status) + ').') + '</p>' : '') +
      '<div class="tw"><table><thead><tr><th>#</th><th>Item</th><th class="n">Qty</th><th>Unit</th><th class="n">Rate ₹ / unit</th><th class="n">Disc. %</th><th class="n">GST %</th><th class="n">Delivery days</th><th class="n">Net rate</th><th class="n">Amount (without GST)</th></tr></thead><tbody>' +
      r.rfq.lines.map(l => '<tr data-qline="' + l.line + '" data-qty="' + esc(l.qty) + '"><td>' + l.line + '</td><td class="nm">' + esc(l.name) + '<small>' + esc([l.brand, l.spec].filter(Boolean).join(' · ')) + '</small></td><td class="n">' + n3(l.qty) + '</td><td>' + esc(l.unit) + '</td>' +
        '<td class="n">' + inp(l, 'rate') + '</td><td class="n">' + inp(l, 'disc', 1) + '</td><td class="n">' + inp(l, 'gst', 1) + '</td><td class="n">' + inp(l, 'days', 1) + '</td><td class="n" data-net></td><td class="n" data-amt></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="grid" style="margin-top:12px">' + whole('qt_fr', 'Freight ₹ (whole quotation)', q.freight, ' inputmode="decimal"') + whole('qt_ld', 'Loading / unloading ₹', q.loading, ' inputmode="decimal"') + whole('qt_pt', 'Payment terms', q.pay_terms, ' maxlength="200"') +
      (ro ? whole('qt_vt', 'Valid till', dmy(q.valid_till)) : '<div class="field"><label for="qt_vt">Valid till</label><input type="date" id="qt_vt" value="' + esc(q.valid_till || '') + '"></div>') + whole('qt_rm', 'Remark', q.remark, ' maxlength="300"') + '</div>' +
      '<p id="qt_sum" style="font-weight:600"></p>' + (ro ? '' : '<div class="acts"><button type="button" class="btn primary" data-act="qtSave">Save quotation</button></div>') +
      ((q.history || []).length ? '<details style="margin-top:12px"><summary>Changed ' + q.history.length + ' time' + (q.history.length === 1 ? '' : 's') + ' – the earlier versions</summary><div class="tw"><table><thead><tr><th>Entered</th><th>By</th><th>Rates</th><th class="n">Freight</th><th class="n">Loading</th></tr></thead><tbody>' +
        q.history.slice().reverse().map(h => '<tr><td>' + dmyAt(h.at) + '</td><td>' + esc(h.name || h.by) + '</td><td class="wrap">' + esc((h.lines || []).map(l => 'line ' + l.line + ': ' + l.rate + (l.disc ? ' − ' + l.disc + '%' : '')).join(' · ')) + '</td><td class="n">' + a2(h.freight) + '</td><td class="n">' + a2(h.loading) + '</td></tr>').join('') + '</tbody></table></div></details>' : '');
    qtSum();
  }
  // the quotation's figures as typed: net rate, amount, the total without GST and its GST (the server works them out again)
  function qtSum() {
    const rows = [...document.querySelectorAll('#qt_form tr[data-qline]')]; let base = 0, gst = 0;
    const val = (tr, f) => { const i = tr.querySelector('[data-f="' + f + '"]'); if (i) return numOf(i.value); const l = ((ST.qt.quote || {}).lines || []).find(y => String(y.line) === tr.dataset.qline); return l ? l[f] : null; };
    rows.forEach(tr => { const rate = val(tr, 'rate'), disc = val(tr, 'disc') || 0, g = val(tr, 'gst'), qty = Number(tr.dataset.qty);
      const net = rate > 0 ? rate * (1 - disc / 100) : null;
      tr.querySelector('[data-net]').textContent = net === null || !isFinite(net) ? '' : a2(r2(net)); tr.querySelector('[data-amt]').textContent = net === null || !isFinite(net) ? '' : a2(r2(net * qty));
      if (net !== null && isFinite(net)) { base += net * qty; if (g) gst += net * qty * g / 100; } });
    const w = id => { const i = $(id); return i && i.tagName === 'INPUT' ? numOf(i.value) || 0 : 0; }, q = ST.qt.quote || {};
    const fr = $('qt_fr') && $('qt_fr').tagName === 'INPUT' ? w('qt_fr') : Number(q.freight || 0), ld = $('qt_ld') && $('qt_ld').tagName === 'INPUT' ? w('qt_ld') : Number(q.loading || 0);
    $('qt_sum').innerHTML = 'Lines ' + money(base) + ' + freight and loading ' + money(fr + ld) + ' = <b>' + money(base + fr + ld) + '</b> without GST · GST beside: ' + money(gst);
  }

  /* ====================== COMPARATIVE STATEMENT – side by side, without GST, L1 marked, the award line by line ====================== */
  async function csPage() {
    frame('cs', '<section class="panel"><h2>Comparative Statement</h2><p class="muted" style="margin:0">Side by side, WITHOUT GST (the GST input credit is taken): landed rate = rate less discount + freight and loading spread over the supplier\'s quoted lines by value. ' +
      '<b>L1</b> = the lowest landed rate of a line. Each line is given to its own supplier; one not L1 needs a reason. <span class="mr">GST शिवाय तुलना; L1 = सर्वात कमी दर.</span></p>' +
      '<div class="bar"><div class="field grow"><label for="cs_rfq">Enquiry</label><select id="cs_rfq"></select></div></div></section><div id="cs_body"></div>');
    const l = (await P('rfqList')).rfqs.filter(q => q.quotes > 0 || q.cs || q.no === ST.cs.rfq);
    $('cs_rfq').innerHTML = '<option value="">– pick an enquiry –</option>' + l.map(q => '<option value="' + q.no + '"' + (q.no === ST.cs.rfq ? ' selected' : '') + '>' + esc(q.ref + ' · ' + q.items + (q.cs ? ' · ' + q.cs.ref + ' ' + q.cs.status : ' · ' + q.quotes + ' quotation' + (q.quotes === 1 ? '' : 's'))) + '</option>').join('');
    if (!ST.cs.rfq) { $('cs_body').innerHTML = l.length ? '' : '<p class="empty">No enquiry has a quotation yet.</p>'; return; }
    csDraw(await P('csGet', { rfq: ST.cs.rfq }));
  }
  const needText = (need, site, lim) => need === 'admin' ? 'a Purchase Admin of ' + site + ' (up to ' + money(lim) + ')' : 'the Super Admin' + (lim === null || lim === undefined ? ' (no limit set)' : ' (above ' + money(lim) + ')');
  function csDraw(r) {
    ST.csv = r; const box = $('cs_body');
    if (!r.cs) {
      box.innerHTML = '<section class="panel"><h2>' + esc(r.rfq.ref) + ' ' + tag(r.rfq.status) + '</h2><p>' + r.quotes + ' quotation' + (r.quotes === 1 ? '' : 's') + ' entered. ' + (r.quotes ? 'Make the CS – it is worked out from the quotations.' : 'Enter the quotations first.') + '</p>' +
        (r.quotes && ['Sent', 'Quotes in'].indexOf(r.rfq.status) > -1 ? '<button type="button" class="btn primary" data-act="csMake">Make the CS</button>' : '') + '</section>';
      return;
    }
    const c = r.cs, sh = c.sheet, V = sh.vendors, ed = c.may.edit;
    const cell = (L, v) => { const q = L.q[v.id]; if (!q) return '<td class="v muted">not quoted</td>';
      const l1 = L.l1.indexOf(v.id) > -1, aw = c.award[L.line] && Number(c.award[L.line].vendor) === v.id;
      return '<td class="v' + (l1 ? ' l1' : '') + (aw ? ' aw' : '') + '" data-cell="' + L.line + ':' + v.id + '"><span class="lr">' + money(q.landed) + '</span>' + (l1 ? ' <span class="tag">L1</span>' : '') +
        '<small>rate ' + a2(q.rate) + (q.disc ? ' − ' + q.disc + '%' : '') + ' · amount ' + money(q.value) + '</small><small>GST ' + (q.gst === null ? '–' : q.gst + '% = ' + money(q.gst_amt)) + (q.days !== null ? ' · ' + q.days + ' days' : '') + '</small></td>'; };
    const awardCell = L => { const a = c.award[L.line] || {};
      if (!ed) { const v = V.find(y => y.id === Number(a.vendor)); return '<td class="nm">' + esc(v ? v.name : '–') + '</td><td class="wrap">' + esc(a.reason || '') + '</td>'; }
      return '<td><select data-aw="' + L.line + '" aria-label="Award of line ' + L.line + '"><option value="">– give to –</option>' + V.filter(v => L.q[v.id]).map(v => '<option value="' + v.id + '"' + (Number(a.vendor) === v.id ? ' selected' : '') + '>' + esc(v.name + (L.l1.indexOf(v.id) > -1 ? ' (L1)' : '')) + '</option>').join('') + '</select></td>' +
        '<td><input data-why="' + L.line + '" maxlength="200" value="' + esc(a.reason || '') + '" placeholder="Why not L1" aria-label="Why not L1, line ' + L.line + '"></td>'; };
    const few = sh.lines.some(L => L.n < 2);
    box.innerHTML = '<section class="panel"><div class="bar" style="margin-top:0;justify-content:space-between;align-items:flex-start"><div><h2>' + esc(c.ref) + ' · ' + esc(c.rfq_ref) + ' ' + tag(c.status) + '</h2>' +
      '<div class="muted">Made by ' + esc(c.created_name) + ' · worked out from the quotations ' + dmyAt(sh.at) + (c.sent_at ? ' · sent by ' + esc(c.sent_name) + ' ' + dmyAt(c.sent_at) : '') + (c.decided_at ? ' · ' + esc(c.status.toLowerCase()) + ' by ' + esc(c.decided_name) + ' ' + dmyAt(c.decided_at) : '') + '</div></div>' +
      '<div class="tiles" style="margin:0;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));min-width:min(100%,520px)"><div class="tile"><small>Total without GST</small><b id="cs_tot" style="font-size:26px">' + money(c.total) + '</b></div><div class="tile"><small>GST (beside)</small><b id="cs_gst" style="font-size:26px">' + money(c.gst) + '</b></div>' +
      '<div class="tile"><small>Approves it</small><span id="cs_need" style="color:var(--ink);font-weight:600">' + esc(needText(c.need, c.site, c.status === 'Draft' || c.status === 'Sent back' ? c.limit : c.cs_limit)) + '</span></div></div></div>' +
      '<div class="tw"><table class="cs"><thead><tr><th>#</th><th>Item</th><th class="n">Qty</th>' + V.map(v => '<th class="v">' + esc(v.name) + '</th>').join('') + '<th>Given to</th><th>Why (not L1)</th></tr></thead><tbody>' +
      sh.lines.map(L => '<tr><td>' + L.line + '</td><td class="nm">' + esc(L.name) + '<small>' + esc(L.ref + ' · ' + L.site) + (L.n < 2 ? ' · <span class="tag warn">' + (L.n ? '1 quotation' : 'no quotation') + '</span>' : '') + '</small></td><td class="n">' + n3(L.qty) + ' ' + esc(L.unit) + '</td>' + V.map(v => cell(L, v)).join('') + awardCell(L) + '</tr>').join('') +
      '</tbody><tfoot><tr><td></td><td class="nm">Freight + loading <small>spread over his quoted lines by value</small></td><td></td>' + V.map(v => '<td class="v">' + money(v.extra) + '<small>on lines worth ' + money(v.base) + '</small></td>').join('') + '<td colspan="2"></td></tr>' +
      '<tr><td></td><td class="nm">His quoted lines – total without GST</td><td></td>' + V.map(v => '<td class="v"><b>' + money(v.total) + '</b><small>GST ' + money(v.gst) + ' · ' + v.quoted + ' of ' + sh.lines.length + ' lines · L1 on ' + v.l1 + '</small></td>').join('') + '<td colspan="2"></td></tr>' +
      '<tr><td></td><td class="nm">Payment terms · valid till</td><td></td>' + V.map(v => '<td class="v wrap">' + esc(v.pay_terms || '–') + '<small>' + (v.valid_till ? 'valid till ' + dmy(v.valid_till) : '') + (v.remark ? ' · ' + esc(v.remark) : '') + '</small></td>').join('') + '<td colspan="2"></td></tr></tfoot></table></div>' +
      (few || c.few_reason ? '<div class="field" style="margin-top:12px"><label for="cs_few">Fewer than 2 quotations – why (P2)</label>' + (ed ? '<textarea id="cs_few" maxlength="300">' + esc(c.few_reason) + '</textarea>' : '<div>' + esc(c.few_reason || '–') + '</div>') + '</div>' : '') +
      '<ul id="cs_prob" class="muted" style="color:var(--bad)"></ul>' +
      '<div class="acts" style="margin-top:12px">' + (ed ? '<button type="button" class="btn" data-act="csMake">Work out again from the quotations</button><button type="button" class="btn" data-act="csSave">Save</button><button type="button" class="btn primary" data-act="csSend">Send for approval</button>' : '') +
      (c.may.decide ? '<button type="button" class="btn primary" data-act="csDec" data-d="approve">Approve</button><button type="button" class="btn" data-act="csDec" data-d="back">Send back</button><button type="button" class="btn bad" data-act="csDec" data-d="reject">Reject</button>' : '') +
      '<button type="button" class="btn" data-act="csPrint">Print</button></div>' +
      (c.status === 'Sent' && !c.may.decide ? '<p class="muted">Waiting for ' + esc(needText(c.need, c.site, c.cs_limit)) + '. ' + esc(c.may.why) + '</p>' : '') +
      ((c.trail || []).length ? '<h3>Decisions</h3><div class="tw"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th class="n">Total</th><th>Why</th></tr></thead><tbody>' + c.trail.map(t => '<tr><td>' + dmyAt(t.at) + '</td><td>' + esc(t.name || t.by) + '</td><td>' + tag(t.act) + '</td><td class="n">' + money(t.total) + '</td><td class="wrap">' + esc(t.why || '') + '</td></tr>').join('') + '</tbody></table></div>' : '') + '</section>';
    csLive();
  }
  // the award as chosen on the page: the total, the GST, who approves and what still stops it (the server checks it all again)
  function csAward() {
    const a = {}; document.querySelectorAll('#cs_body select[data-aw]').forEach(s => { const w = document.querySelector('#cs_body input[data-why="' + s.dataset.aw + '"]'); if (s.value) a[s.dataset.aw] = { vendor: Number(s.value), reason: w ? w.value : '' }; });
    return a;
  }
  function csLive() {
    const r = ST.csv; if (!r || !r.cs) return; const c = r.cs, sh = c.sheet;
    if (!c.may.edit) { $('cs_prob').innerHTML = ''; return; }
    const a = csAward(), few = ($('cs_few') || {}).value || '', prob = []; let tot = 0, gst = 0;
    sh.lines.forEach(L => { const x = a[L.line], what = 'Line ' + L.line + ' (' + L.name + ')';
      if (L.n < 2 && few.trim().length < 3) prob.push(what + ': ' + (L.n ? 'only 1 quotation' : 'no quotation') + ' – write why in "Fewer than 2 quotations – why".');
      document.querySelectorAll('#cs_body td[data-cell^="' + L.line + ':"]').forEach(td => td.classList.toggle('aw', !!x && td.dataset.cell === L.line + ':' + x.vendor));
      const w = document.querySelector('#cs_body input[data-why="' + L.line + '"]'), l1 = x && L.l1.indexOf(x.vendor) > -1; if (w) w.hidden = !x || l1;
      if (!x) { prob.push(what + ': not given to a supplier yet.'); return; }
      if (!l1 && x.reason.trim().length < 3) prob.push(what + ': not given to L1 – write why.');
      tot += L.q[x.vendor].value; gst += Number(L.q[x.vendor].gst_amt || 0); });
    $('cs_tot').textContent = money(r2(tot)); $('cs_gst').textContent = money(r2(gst));
    const lim = c.limit; $('cs_need').textContent = needText(lim === null || lim === undefined ? 'super' : r2(tot) <= lim ? 'admin' : 'super', c.site, lim);
    $('cs_prob').innerHTML = prob.map(p => '<li>' + esc(p) + '</li>').join('');
    const send = document.querySelector('#cs_body [data-act="csSend"]'); if (send) send.disabled = prob.length > 0;
  }
  function csPrint() {
    const c = ST.csv.cs, sh = c.sheet, V = sh.vendors;
    printHtml(c.ref, '<div class="hd"><div><h1>Rachana Construction Limited</h1><div class="muted">Purchase Department</div></div><div style="text-align:right"><h2 style="margin:0">COMPARATIVE STATEMENT</h2><b>' + esc(c.ref) + '</b> · ' + esc(c.rfq_ref) + '<br>' + esc(c.status) + '</div></div>' +
      '<p class="muted">Without GST – landed rate = rate less discount + freight and loading spread by value. L1 = the lowest landed rate.</p><table><thead><tr><th>#</th><th>Item</th><th class="n">Qty</th>' + V.map(v => '<th class="n">' + esc(v.name) + '</th>').join('') + '<th>Given to</th></tr></thead><tbody>' +
      sh.lines.map(L => '<tr><td>' + L.line + '</td><td>' + esc(L.name) + '</td><td class="n">' + n3(L.qty) + ' ' + esc(L.unit) + '</td>' + V.map(v => { const q = L.q[v.id]; return '<td class="n">' + (q ? a2(q.landed) + (L.l1.indexOf(v.id) > -1 ? ' (L1)' : '') : '–') + '</td>'; }).join('') +
        '<td>' + esc((V.find(v => c.award[L.line] && v.id === Number(c.award[L.line].vendor)) || {}).name || '') + (c.award[L.line] && c.award[L.line].reason ? ' – ' + esc(c.award[L.line].reason) : '') + '</td></tr>').join('') +
      '</tbody></table><p><b>Total without GST: ' + money(c.total) + '</b> · GST: ' + money(c.gst) + '</p>' + (c.few_reason ? '<p>Fewer than 2 quotations: ' + esc(c.few_reason) + '</p>' : '') +
      (c.trail || []).map(t => '<div>' + esc(t.act) + ' – ' + esc(t.name || t.by) + ' · ' + dmyAt(t.at) + (t.why ? ' · ' + esc(t.why) : '') + '</div>').join(''));
  }

  /* ====================== WAITING FOR MY APPROVAL ====================== */
  async function approve() {
    frame('approve', '<section class="panel"><h2>Waiting for my approval</h2><p class="muted" style="margin:0">The comparative statements you may decide now: up to the limit a Purchase Admin of its site, above it the Super Admin – never one\'s own. <span class="mr">माझ्या मंजुरीसाठी.</span></p><div id="ap_body" style="margin-top:12px"></div></section>');
    const r = await P('csList', { mine: 1 });
    $('ap_body').innerHTML = (r.list.length ? '<div class="tw"><table><thead><tr><th>CS</th><th>Enquiry</th><th>Items</th><th class="n">Total without GST</th><th class="n">GST</th><th>Sent by</th><th></th></tr></thead><tbody>' +
      r.list.map(c => '<tr><td><b>' + esc(c.ref) + '</b><small>' + esc(c.site) + '</small></td><td>' + esc(c.rfq_ref) + '</td><td class="wrap">' + esc(c.items) + '</td><td class="n"><b>' + money(c.total) + '</b></td><td class="n">' + money(c.gst) + '</td><td>' + esc(c.sent_name) + '<small>' + dmyAt(c.sent_at) + '</small></td>' +
        '<td><button type="button" class="btn small primary" data-act="apOpen" data-rfq="' + c.rfq_no + '">Open</button></td></tr>').join('') + '</tbody></table></div>' : '<p class="empty">Nothing waits for you.</p>') +
      ((r.elsewhere || []).length ? '<p class="muted">Waiting for a Purchase Admin of another of your sites: ' + r.elsewhere.map(c => esc(c.ref + ' (' + c.site + ')')).join(', ') + ' – open Purchase on that site (Change site) to decide it.</p>' : '');
  }

  /* ====================== SUPPLIERS ====================== */
  async function vendors() {
    frame('vendors', '<section class="panel" id="vn_form" hidden></section><section class="panel"><h2>Suppliers</h2><p class="muted" style="margin:0">Purchase\'s own supplier list – one for every site. GST no. and PAN are checked (the PAN comes from the GST no.). <span class="mr">पुरवठादारांची यादी.</span></p>' +
      '<div class="bar"><div class="field grow"><label for="vn_q">Find</label><input id="vn_q" autocomplete="off"></div><button type="button" class="btn primary" data-act="vnNew">+ Add supplier</button></div><div id="vn_list"></div></section>');
    ST.vendors = (await P('vendorList')).vendors; vnList();
    if (ST.vForm) vnForm(); else $('vn_form').hidden = true;
  }
  function vnList() {
    const q = String($('vn_q').value || '').toLowerCase().trim(), l = ST.vendors.filter(v => !q || [v.name, v.gstin, v.phone, (v.supplies || []).join(' ')].join(' ').toLowerCase().indexOf(q) > -1);
    $('vn_list').innerHTML = l.length ? '<div class="tw"><table><thead><tr><th>Supplier</th><th>GST no. · PAN</th><th>Phone · E-mail</th><th>Supplies</th><th>Status</th><th></th></tr></thead><tbody>' +
      l.map(v => '<tr' + (v.status === 'Blocked' ? ' class="off"' : '') + '><td class="nm">' + esc(v.name) + '<small>' + esc(v.address) + '</small></td><td>' + esc(v.gstin || '–') + '<small>' + esc(v.pan) + '</small></td><td>' + esc(v.phone) + '<small>' + esc(v.email) + '</small></td>' +
        '<td class="wrap">' + (v.supplies || []).map(t => '<span class="chip">' + esc(t) + '</span>').join('') + '</td><td>' + tag(v.status) + (v.status_note ? '<small>' + esc(v.status_note) + '</small>' : '') + '</td>' +
        '<td><div class="acts"><button type="button" class="link" data-act="vnEdit" data-id="' + v.id + '">Change</button>' + (isAdmin() ? '<button type="button" class="link' + (v.status === 'Approved' ? ' del' : '') + '" data-act="vnStatus" data-id="' + v.id + '">' + (v.status === 'Approved' ? 'Block' : 'Approve') + '</button>' : '') + '</div></td></tr>').join('') +
      '</tbody></table></div>' : '<p class="empty">' + (ST.vendors.length ? 'No supplier found.' : 'No supplier yet – add the first one.') + '</p>';
  }
  function vnForm() {
    const v = ST.vForm, box = $('vn_form'); box.hidden = false;
    const f = (id, label, val, extra) => '<div class="field' + (id === 'vn_ad' || id === 'vn_sp' ? ' wide' : '') + '"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(val || '') + '"' + (extra || '') + '></div>';
    box.innerHTML = '<h2>' + (v.id ? 'Change supplier' : 'Add a supplier') + '</h2><div class="grid">' + f('vn_nm', 'Name', v.name, ' maxlength="80"') + f('vn_gs', 'GST no.', v.gstin, ' maxlength="15" style="text-transform:uppercase"') + f('vn_pn', 'PAN (from the GST no. when empty)', v.pan, ' maxlength="10" style="text-transform:uppercase"') +
      f('vn_ph', 'Mobile', v.phone, ' inputmode="tel" maxlength="14"') + f('vn_em', 'E-mail', v.email, ' type="email" maxlength="120"') + f('vn_ad', 'Address', v.address, ' maxlength="300"') + f('vn_sp', 'What he supplies (commas between: Cement, Steel …)', (v.supplies || []).join(', '), ' maxlength="400"') + '</div>' +
      '<div class="acts"><button type="button" class="btn primary" data-act="vnSave">Save supplier</button><button type="button" class="btn" data-act="vnClose">Cancel</button></div>';
    $('vn_nm').focus();
  }
  document.addEventListener('input', e => { if (e.target.id === 'vn_q') vnList(); });
  document.addEventListener('focusout', e => { if (e.target.id === 'vn_gs' && !$('vn_pn').value.trim() && /^[0-9]{2}[A-Za-z]{5}[0-9]{4}/.test(e.target.value.trim())) $('vn_pn').value = e.target.value.trim().toUpperCase().slice(2, 12); });

  /* ====================== SETTINGS – the CS limit (the Super Admin) ====================== */
  async function settings() {
    frame('settings', '<section class="panel"><h2>CS approval limit</h2><p class="muted">Up to this amount (the CS total without GST) a Purchase Admin of its site approves a comparative statement; above it the Super Admin. Not set: every CS goes to the Super Admin. ' +
      '<span class="mr">या रकमेपर्यंत Purchase Admin, त्यावर Super Admin मंजूर करतात.</span></p><div id="se_now"></div><div class="bar"><div class="field"><label for="se_lim">Limit ₹</label><input id="se_lim" inputmode="decimal"></div><button type="button" class="btn primary" data-act="seSave">Save</button></div></section>');
    const r = await P('settings'); seNow(r);
  }
  const seNow = r => { $('se_now').innerHTML = r.limit === null ? '<p><b>Not set</b> – every CS goes to the Super Admin.</p>' : '<p>Now: <b>' + money(r.limit) + '</b>' + (r.by ? ' <span class="muted">– set by ' + esc(r.by) + ' · ' + dmyAt(r.at) + '</span>' : '') + '</p>'; $('se_lim').value = r.limit === null ? '' : r.limit; };

  /* ====================== the buttons of every page ====================== */
  const ACT = {
    inMake() {
      const lines = [...ST.pick.values()]; if (!lines.length) return;
      const needs = lines.map(l => l.need_by).filter(Boolean).sort();
      ST.rfqForm = { no: 0, ver: 0, date: today(), need_by: needs[0] || '', remark: '', lines: lines.map(l => Object.assign({}, l)), vendors: new Set() }; ST.rfqNo = 0;
      K().go('rfq');
    },
    inClear() { ST.pick.clear(); document.querySelectorAll('#pg_inbox input[data-k]').forEach(c => { c.checked = false; }); bar(); },
    rfFromInbox() { K().go('inbox'); },
    async rfOpen(b) { await rfqOpen(Number(b.dataset.no)); $('rf_view').scrollIntoView({ block: 'start' }); },
    rfHide() { ST.rfqNo = 0; $('rf_view').hidden = true; },
    rfClose() { ST.rfqForm = null; $('rf_form').hidden = true; if (ST.rfqNo) rfqOpen(ST.rfqNo).catch(failed); },
    rfDrop(b) { ST.rfqForm.lines.splice(Number(b.dataset.i), 1); rfLines(); },
    async rfEdit() { const q = ST.rfq.rfq; ST.rfqForm = { no: q.no, ver: q.ver, date: q.date, need_by: q.need_by || '', remark: q.remark, lines: q.lines.map(l => Object.assign({}, l)), vendors: new Set(q.vendors.map(v => Number(v.id))) }; await rfqFormDraw(); },
    async rfSave(b) {
      const f = ST.rfqForm;
      const x = { no: f.no || undefined, ver: f.ver, date: $('rf_date').value, need_by: $('rf_need').value, remark: $('rf_rem').value, lines: f.lines.map(l => ({ site: l.site, req_no: l.req_no, req_line: l.req_line, qty: String(l.qty).replace(/,/g, '') })), vendors: [...f.vendors] };
      if (f.vendors.size < 2 && !(await ask('Only ' + f.vendors.size + ' supplier?', '<p>At least 2 quotations an item (P2) – with fewer, the CS needs a typed reason.</p>', [{ label: 'Go back', value: false }, { label: 'Save anyway', value: true, primary: true }]))) return;
      b.disabled = true;
      try { const r = await P('rfqSave', x); toast('Saved – ' + r.rfq.ref + '.'); if (!f.no) ST.pick.clear(); ST.rfqForm = null; ST.rfqNo = r.rfq.no; await rfqList(); await rfqOpen(r.rfq.no); }
      finally { b.disabled = false; }
    },
    async rfSend() {
      const q = ST.rfq.rfq;
      if (!(await ask('Mark ' + q.ref + ' as sent?', '<p>Share it on WhatsApp or give the print to each supplier. After this, their quotations are entered.</p>', [{ label: 'Not yet', value: false }, { label: 'Mark as sent', value: true, primary: true }]))) return;
      await P('rfqSend', { no: q.no, ver: q.ver }); toast(q.ref + ' – sent.'); await rfqList(); await rfqOpen(q.no);
    },
    rfPrint() { rfqPrint(); },
    async rfCancel() {
      const q = ST.rfq.rfq, why = await askWhy('Cancel ' + q.ref + '?', 'Why is it cancelled?', 'Cancel enquiry'); if (why === null) return;
      await P('rfqCancel', { no: q.no, ver: q.ver, why: why }); toast(q.ref + ' – cancelled.'); await rfqList(); await rfqOpen(q.no);
    },
    rfQuote(b) { ST.q = { rfq: ST.rfq.rfq.no, vendor: Number(b.dataset.v) }; K().go('quotes'); },
    rfCs() { ST.cs = { rfq: ST.rfq.rfq.no }; K().go('cs'); },
    async qtSave(b) {
      const lines = [...document.querySelectorAll('#qt_form tr[data-qline]')].map(tr => { const g = f => (tr.querySelector('[data-f="' + f + '"]') || {}).value; return { line: Number(tr.dataset.qline), rate: g('rate'), disc: g('disc'), gst: g('gst'), days: g('days') }; });
      const q = ST.qt.quote;
      b.disabled = true;
      try { await P('quoteSave', { rfq: ST.q.rfq, vendor: ST.q.vendor, ver: q ? q.ver : undefined, lines: lines, freight: $('qt_fr').value, loading: $('qt_ld').value, pay_terms: $('qt_pt').value, valid_till: $('qt_vt').value, remark: $('qt_rm').value });
        toast('Quotation of ' + ST.qt.vendor.name + ' saved.'); await quotes(); }
      finally { b.disabled = false; }
    },
    async csMake() { const r = await P('csMake', { rfq: ST.cs.rfq, version: ST.csv && ST.csv.cs ? ST.csv.cs.version : undefined }); toast(r.cs.ref + ' – worked out from the quotations.'); csDraw(r); },
    async csSave() { const c = ST.csv.cs; const r = await P('csSave', { no: c.no, version: c.version, award: csAward(), few_reason: ($('cs_few') || {}).value || '' }); toast(c.ref + ' saved.'); csDraw(r); },
    async csSend() {
      const c = ST.csv.cs;
      if (!(await ask('Send ' + c.ref + ' for approval?', '<p>Total without GST: <b>' + esc($('cs_tot').textContent) + '</b> – approved by ' + esc($('cs_need').textContent) + '.</p><p class="mr">The quotations are locked once it is sent.</p>', [{ label: 'Not yet', value: false }, { label: 'Send for approval', value: true, primary: true }]))) return;
      const r = await P('csSend', { no: c.no, version: c.version, award: csAward(), few_reason: ($('cs_few') || {}).value || '' }); toast(c.ref + ' – sent for approval.'); csDraw(r);
    },
    async csDec(b) {
      const c = ST.csv.cs, d = b.dataset.d, name = { approve: 'Approve', back: 'Send back', reject: 'Reject' }[d];
      let why = '';
      if (d === 'approve') { if (!(await ask('Approve ' + c.ref + '?', '<p>Total without GST: <b>' + money(c.total) + '</b> (GST ' + money(c.gst) + ').</p>', [{ label: 'Cancel', value: false }, { label: 'Approve', value: true, primary: true }]))) return; }
      else { why = await askWhy(name + ' ' + c.ref + '?', d === 'back' ? 'What is to be corrected?' : 'Why is it rejected?', name); if (why === null) return; }
      const r = await P('csDecide', { no: c.no, version: c.version, act: d, why: why }); toast(c.ref + ' – ' + r.cs.status.toLowerCase() + '.'); csDraw(r);
    },
    csPrint() { csPrint(); },
    apOpen(b) { ST.cs = { rfq: Number(b.dataset.rfq) }; K().go('cs'); },
    vnNew() { ST.vForm = { id: 0 }; vnForm(); },
    vnEdit(b) { ST.vForm = Object.assign({}, ST.vendors.find(v => v.id === Number(b.dataset.id))); vnForm(); $('vn_form').scrollIntoView({ block: 'start' }); },
    vnClose() { ST.vForm = null; $('vn_form').hidden = true; },
    async vnSave(b) {
      const v = ST.vForm, g = id => $(id).value;
      b.disabled = true;
      try { const r = await P('vendorSave', { id: v.id || undefined, ver: v.ver, name: g('vn_nm'), gstin: g('vn_gs'), pan: g('vn_pn'), phone: g('vn_ph'), email: g('vn_em'), address: g('vn_ad'), supplies: g('vn_sp') });
        toast('Saved – ' + r.vendor.name + '.'); ST.vForm = null; ST.vendors = null; await vendors(); }
      finally { b.disabled = false; }
    },
    async vnStatus(b) {
      const v = ST.vendors.find(y => y.id === Number(b.dataset.id)), to = v.status === 'Approved' ? 'Blocked' : 'Approved';
      let why = '';
      if (to === 'Blocked') { why = await askWhy('Block ' + v.name + '?', 'Why is he blocked? (he is not asked in a new enquiry)', 'Block'); if (why === null) return; }
      else if (!(await ask('Approve ' + v.name + ' again?', '<p>He can be asked in enquiries again.</p>', [{ label: 'Cancel', value: false }, { label: 'Approve', value: true, primary: true }]))) return;
      await P('vendorStatus', { id: v.id, ver: v.ver, status: to, why: why }); toast(v.name + ' – ' + to.toLowerCase() + '.'); ST.vendors = null; await vendors();
    },
    async seSave() { const r = await P('settingsSave', { limit: $('se_lim').value }); toast('The CS limit is ' + money(r.limit) + '.'); seNow(r); },
  };
  // a reason asked (at least 3 letters) – null: not done
  async function askWhy(title, label, okLabel) {
    for (;;) {
      const v = await ask(title, '<div class="field"><label for="why_t">' + esc(label) + '</label><textarea id="why_t" maxlength="300"></textarea></div>', [{ label: 'Go back', value: null }, { label: okLabel, value: 'ok', primary: true }]);
      if (v === null) return null;
      const t = String((document.getElementById('why_t') || {}).value || '').trim();
      if (t.length >= 3) return t;
      toast('Write the reason (a few words).', true);
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || !ACT[b.dataset.act] || !b.closest('main')) return;
    Promise.resolve().then(() => ACT[b.dataset.act](b)).catch(failed);
  });

  window.RPW = { open: page => ({ inbox: inbox, rfq: rfqPage, quotes: quotes, cs: csPage, approve: approve, vendors: vendors, settings: settings }[page] || (() => Promise.resolve()))() };
})();
