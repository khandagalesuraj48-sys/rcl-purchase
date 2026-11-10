/* THE RULES OF PURCHASE PHASE 1 – suppliers, enquiries (RFQ), quotations, the comparative statement (CS) and its approval
 * (09-11-2026). No database here: api/pur.js asks these, the unit test checks them case by case. Written fresh for RCL.
 * The owner's decisions of 09-11-2026:
 *   P1 a CS is approved BY AMOUNT: up to the limit the Super Admin sets, a Purchase Admin (of the CS's site); above it – or no limit
 *      set yet – the Super Admin. The maker and the last editor (and who sent it) never approve their own CS.
 *   P2 at least 2 quotations an item; fewer only with a typed reason (kept on the CS). The award is ITEM-WISE: each line its vendor.
 *   P3 the comparison is WITHOUT GST (the company takes the GST input credit): landed rate per unit = rate × (1 − discount %) +
 *      (freight + loading) spread over the vendor's quoted lines by their value; GST % and GST ₹ beside. L1 = the lowest landed rate
 *      of a line (to the paisa; equal ones are all L1); a line given to a vendor who is not L1 needs a reason. */
'use strict';
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r3 = n => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const num = v => v === null || v === undefined || v === '' ? 0 : Number(v);
const today = (t) => new Date((t || Date.now()) + 330 * 60000).toISOString().slice(0, 10);      // (a day in India)
const dmy = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? m[3] + '-' + m[2] + '-' + m[1] : String(d || ''); };
class RuleError extends Error { constructor(m) { super(m); this.user = true; } }
const err = m => { throw new RuleError(m); };
const clean = (v, n) => String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 200);
// a name's key: capitals, spaces and signs do not count ("Shree Traders" = "SHREE-TRADERS")
const keyOf = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const lower = v => String(v || '').trim().toLowerCase();
const noOf = n => 'RFQ-' + String(n).padStart(4, '0');
const csNoOf = n => 'CS-' + String(n).padStart(4, '0');

// a day (yyyy-mm-dd); not after today unless opt.future
function dayOf(v, what, opt) {
  opt = opt || {};
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) { if (opt.optional) return null; err('Enter the ' + what + '.'); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + 'T00:00:00Z')) || new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s) err('The ' + what + ' "' + s + '" is not a date.');
  if (!opt.future && s > today()) err('The ' + what + ' ' + dmy(s) + ' is after today.');
  if (s < '2020-01-01') err('The ' + what + ' ' + dmy(s) + ' is too far back.');
  return s;
}
// a number from … to …; blank → dflt
function numIn(v, what, lo, hi, dflt) {
  const s = String(v === undefined || v === null ? '' : v).trim().replace(/,/g, '').replace(/%$/, '');
  if (s === '') return dflt;
  const n = Number(s);
  if (!isFinite(n) || n < lo || n > hi) err(what + ' "' + s + '" must be a number from ' + lo + ' to ' + hi + '.');
  return n;
}

/* ---------- A SUPPLIER (the same checks as Mechanical's Vendor Master – validateVendor_: GST no., PAN, e-mail, mobile) ---------- */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
function checkVendor(x) {
  x = x || {};
  const name = clean(x.name, 80); if (keyOf(name).length < 2) err('Enter the supplier\'s name.');
  const up = v => clean(v, 40).toUpperCase().replace(/\s+/g, '');
  const gstin = up(x.gstin); let pan = up(x.pan);
  if (gstin && !GSTIN.test(gstin)) err('GST no. "' + gstin + '" is not in the right format (15 characters, e.g. 27ABCDE1234F1Z5).');
  if (!pan && gstin) pan = gstin.slice(2, 12);      // (the PAN is inside the GST no.)
  if (pan && !PAN.test(pan)) err('PAN "' + pan + '" is not in the right format (10 characters, e.g. ABCDE1234F).');
  if (gstin && pan && gstin.slice(2, 12) !== pan) err('PAN ' + pan + ' does not match the PAN inside the GST no. (' + gstin.slice(2, 12) + ').');
  const email = clean(x.email, 120).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err('E-mail "' + email + '" does not look right.');
  const phone = clean(x.phone, 20).replace(/[\s-]+/g, '');
  if (phone && !/^(\+?91)?[6-9][0-9]{9}$/.test(phone)) err('Mobile number should be 10 digits.');
  const raw = Array.isArray(x.supplies) ? x.supplies : String(x.supplies || '').split(/[,\n]/), seen = new Set(), supplies = [];
  raw.forEach(t => { const v = clean(t, 40), k = keyOf(v); if (k && !seen.has(k)) { seen.add(k); supplies.push(v); } });
  if (supplies.length > 20) err('At most 20 kinds of supply – keep the main ones.');
  return { name: name, name_key: keyOf(name), gstin: gstin, pan: pan, address: clean(x.address, 300), phone: phone, email: email, supplies: supplies };
}
// the WhatsApp number of a mobile (India: 91 before a 10-digit number); '' = none
const waOf = phone => { const d = String(phone || '').replace(/[^0-9]/g, ''); return d.length === 10 ? '91' + d : d.length === 12 && d.startsWith('91') ? d : ''; };

/* ---------- AN ENQUIRY (RFQ) ---------- */
const lineKey = (site, req, line) => String(site) + ':' + Number(req) + ':' + Number(line);
// what the page sent: date, need-by, remark, its lines (site, requirement, line, qty) and the suppliers asked (their ids)
function checkRfq(x) {
  x = x || {};
  const date = dayOf(x.date, 'date'), need = dayOf(x.need_by, 'need-by date', { optional: true, future: true });
  if (need && need < date) err('The need-by date ' + dmy(need) + ' is before the date ' + dmy(date) + '.');
  const lines = Array.isArray(x.lines) ? x.lines : [], seen = new Set(), out = [];
  if (!lines.length) err('Add at least one line (Inbox → tick the lines → Make enquiry).');
  if (lines.length > 200) err('At most 200 lines in one enquiry.');
  lines.forEach((l, i) => {
    const site = String((l && l.site) || '').toUpperCase(), req = Number(l && l.req_no), ln = Number(l && l.req_line);
    if (!/^[A-Z0-9]{1,12}$/.test(site) || !Number.isInteger(req) || req < 1 || !Number.isInteger(ln) || ln < 1) err('Line ' + (i + 1) + ' is not a line of a requirement – add it from the Inbox.');
    const k = lineKey(site, req, ln); if (seen.has(k)) err('The same requirement line is there twice (line ' + (i + 1) + ').');
    seen.add(k);
    const qty = numIn(l.qty, 'Quantity of line ' + (i + 1), 0, 1e9, 0); if (!(qty > 0)) err('Enter the quantity of line ' + (i + 1) + '.');
    out.push({ site: site, req_no: req, req_line: ln, qty: r3(qty) });
  });
  const ids = [...new Set((Array.isArray(x.vendors) ? x.vendors : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) err('Pick the suppliers to ask (at least 2 – P2: at least 2 quotations an item).');
  if (ids.length > 30) err('At most 30 suppliers in one enquiry.');
  return { date: date, need_by: need, remark: clean(x.remark, 300), lines: out, vendors: ids };
}
/* the lines an enquiry is to have: each from the Inbox (the Store's approved requirement lines still to order – pending), never more
 * than is left, never a line that another open enquiry has (taken); a line it has already, as it is (not asked of the Store again –
 * had). Line numbers stay; a new line takes the next. */
function rfqLines(asked, pending, taken, had, mySites, rfqNo) {
  const old = new Map((had || []).map(l => [lineKey(l.site, l.req_no, l.req_line), l])), out = [];
  let next = (had || []).reduce((m, l) => Math.max(m, Number(l.line) || 0), 0);
  asked.forEach((a, i) => {
    const k = lineKey(a.site, a.req_no, a.req_line), h = old.get(k);
    if (mySites && !mySites.has(a.site)) err('Line ' + (i + 1) + ' is of site ' + a.site + ' – you have no Purchase there.');
    const t = taken[k];
    if (t && Number(t.rfq) !== Number(rfqNo || 0)) err('Line ' + (i + 1) + ' (requirement ' + a.req_no + ', line ' + a.req_line + ' of ' + a.site + ') is already in ' + noOf(t.rfq) + ' – one line is asked once.');
    if (h && a.qty <= num(h.qty) + 0.0005) { out.push(Object.assign({}, h, { qty: a.qty })); return; }      // (kept as it is – less is fine)
    const p = pending[k];
    if (!p) err('Line ' + (i + 1) + ' (requirement ' + a.req_no + ', line ' + a.req_line + ' of ' + a.site + ') is not to order any more (not approved, or ordered) – refresh the Inbox.');
    if (a.qty > num(p.left) + 0.0005) err('Line ' + (i + 1) + ', ' + p.name + ': ' + a.qty + ' asked, only ' + r3(p.left) + ' ' + p.unit + ' is still to order.');
    out.push({ line: h ? h.line : ++next, site: a.site, req_no: a.req_no, req_line: a.req_line, ref: p.ref || '', code: p.code || '', name: p.name || '', unit: p.unit || '',
      qty: a.qty, brand: p.brand || '', spec: p.spec || '', need_by: p.need_by || null });
  });
  return out.sort((a, b) => a.line - b.line);
}
// the requirement lines in an OPEN enquiry (Draft / Sent / Quotes in) or awarded (Closed with its CS approved): line → { rfq, status, cs }
function takenOf(rfqs, csOf) {
  const out = {};
  (rfqs || []).forEach(r => {
    const c = csOf && csOf[r.no];
    const open = ['Draft', 'Sent', 'Quotes in'].indexOf(r.status) > -1, awarded = r.status === 'Closed' && c && c.status === 'Approved';
    if (!open && !awarded) return;
    (r.lines || []).forEach(l => { out[lineKey(l.site, l.req_no, l.req_line)] = { rfq: Number(r.no), status: awarded ? 'Awarded' : r.status, cs: c ? Number(c.no) : null }; });
  });
  return out;
}

/* ---------- A QUOTATION (one supplier, one enquiry) ---------- */
function checkQuote(x, rfqLines_) {
  x = x || {};
  const by = new Map((Array.isArray(x.lines) ? x.lines : []).map(l => [Number(l && l.line), l || {}])), out = [];
  (rfqLines_ || []).forEach(L => {
    const l = by.get(Number(L.line)); if (!l) return;
    const what = 'line ' + L.line + ' (' + L.name + ')';
    const rate = numIn(l.rate, 'Rate of ' + what, 0, 1e9, null);
    if (rate === null || rate === 0) return;      // (not quoted)
    out.push({ line: Number(L.line), rate: r2(rate), disc: r2(numIn(l.disc, 'Disc. % of ' + what, 0, 99.99, 0)), gst: (g => g === null ? null : r2(g))(numIn(l.gst, 'GST % of ' + what, 0, 40, null)),
      days: (d => { if (d === null) return null; if (!Number.isInteger(d)) err('Delivery days of ' + what + ' must be whole days.'); return d; })(numIn(l.days, 'Delivery days of ' + what, 0, 365, null)) });
  });
  if (!out.length) err('Enter the rate of at least one line (a line not quoted: leave its rate empty).');
  return { lines: out, freight: r2(numIn(x.freight, 'Freight', 0, 1e9, 0)), loading: r2(numIn(x.loading, 'Loading', 0, 1e9, 0)), pay_terms: clean(x.pay_terms, 200),
    valid_till: dayOf(x.valid_till, 'valid-till date', { optional: true, future: true }), remark: clean(x.remark, 300) };
}
// what of a quotation is kept as its earlier version (history)
const quoteWas = q => ({ lines: q.lines, freight: num(q.freight), loading: num(q.loading), pay_terms: q.pay_terms || '', valid_till: q.valid_till || null, remark: q.remark || '', by: q.updated_by || q.created_by || '', name: q.updated_name || q.created_name || '', at: q.updated_at || q.created_at || '' });

/* ---------- THE COMPARISON (P3 – without GST) ----------
 * net = rate × (1 − disc %); a vendor's base = Σ net × qty of the lines he quoted; his freight + loading is spread over those lines by
 * their value: a line's share = (freight + loading) × (its net × qty) ÷ base, so per unit landed = net × (1 + (freight + loading) ÷ base).
 * Landed rate to the paisa; amount = landed × qty; GST ₹ = net × qty × GST % (on the goods, as on the company's PO; freight without GST). */
function compare(rfq, quotes) {
  const lines = (rfq.lines || []).slice().sort((a, b) => a.line - b.line);
  const vs = (quotes || []).map(q => {
    const by = {}; (q.lines || []).forEach(l => { if (num(l.rate) > 0) by[Number(l.line)] = l; });
    let base = 0; lines.forEach(L => { const l = by[L.line]; if (l) base += num(l.rate) * (1 - num(l.disc) / 100) * num(L.qty); });
    const extra = r2(num(q.freight) + num(q.loading));
    return { id: Number(q.vendor_id), name: q.vendor_name || '', freight: r2(num(q.freight)), loading: r2(num(q.loading)), extra: extra, base: r2(base), factor: base > 0 ? extra / base : 0,
      pay_terms: q.pay_terms || '', valid_till: q.valid_till || null, remark: q.remark || '', by: by };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const out = lines.map(L => {
    const q = {}, qty = num(L.qty);
    vs.forEach(v => {
      const l = v.by[L.line]; if (!l) return;
      const net = num(l.rate) * (1 - num(l.disc) / 100), landed = r2(net * (1 + v.factor)), gst = l.gst === null || l.gst === undefined || l.gst === '' ? null : num(l.gst);
      q[v.id] = { rate: r2(l.rate), disc: r2(num(l.disc)), net: r2(net), landed: landed, value: r2(landed * qty), gst: gst, gst_amt: gst === null ? null : r2(net * qty * gst / 100), days: l.days === null || l.days === undefined ? null : Number(l.days) };
    });
    const ids = Object.keys(q).map(Number), min = ids.length ? Math.min(...ids.map(i => q[i].landed)) : null;
    return { line: L.line, site: L.site, req_no: L.req_no, req_line: L.req_line, ref: L.ref || '', code: L.code || '', name: L.name || '', unit: L.unit || '', qty: qty, brand: L.brand || '', spec: L.spec || '',
      q: q, n: ids.length, l1: ids.filter(i => q[i].landed === min).sort((a, b) => a - b), l1_rate: min };
  });
  return { at: new Date().toISOString(), lines: out,
    vendors: vs.map(v => { const mine = out.filter(L => L.q[v.id]);
      return { id: v.id, name: v.name, freight: v.freight, loading: v.loading, extra: v.extra, base: v.base, pay_terms: v.pay_terms, valid_till: v.valid_till, remark: v.remark,
        quoted: mine.length, total: r2(mine.reduce((s, L) => s + L.q[v.id].value, 0)), gst: r2(mine.reduce((s, L) => s + num(L.q[v.id].gst_amt), 0)), l1: mine.filter(L => L.l1.indexOf(v.id) > -1).length }; }) };
}
// a first award: each line to its L1 (the first one when two are equal) – the maker changes it
const awardL1 = sheet => { const a = {}; (sheet.lines || []).forEach(L => { if (L.l1.length) a[L.line] = { vendor: L.l1[0], reason: '' }; }); return a; };
/* the award as the page sent it, checked against the comparison: { line: { vendor, reason } }. A vendor who did not quote a line
 * cannot have it. → { award, total, gst, problems } – problems (what stops it being sent): a line not awarded, a line not to L1 without
 * a reason, a line with fewer than 2 quotations without the reason of the CS (few). */
function awardOf(sheet, award, few) {
  const a = award && typeof award === 'object' ? award : {}, out = {}, problems = [];
  let total = 0, gst = 0;
  const fewText = clean(few, 300);
  (sheet.lines || []).forEach(L => {
    const x = a[L.line] || a[String(L.line)], what = 'Line ' + L.line + ' (' + L.name + ')';
    const v = x && x.vendor !== undefined && x.vendor !== null && x.vendor !== '' ? Number(x.vendor) : null;
    if (L.n < 2 && fewText.length < 3) problems.push(what + ': ' + (L.n ? 'only 1 quotation' : 'no quotation') + ' – write why in "Fewer than 2 quotations – why" (P2).');
    if (v === null) { problems.push(what + ': not given to a supplier yet.'); return; }
    if (!L.q[v]) err(what + ': this supplier did not quote it.');
    const reason = clean(x.reason, 200), l1 = L.l1.indexOf(v) > -1;
    if (!l1 && reason.length < 3) problems.push(what + ': not given to L1 – write why.');
    out[L.line] = { vendor: v, reason: l1 ? '' : reason };
    total += L.q[v].value; gst += num(L.q[v].gst_amt);
  });
  return { award: out, total: r2(total), gst: r2(gst), few: fewText, problems: problems };
}

/* ---------- THE APPROVAL (P1) ---------- */
// who must approve: up to the limit a Purchase Admin, above it the Super Admin; no limit set yet → the Super Admin
const needOf = (total, limit) => limit === null || limit === undefined || limit === '' || !isFinite(Number(limit)) ? 'super' : num(total) <= Number(limit) + 0.0001 ? 'admin' : 'super';
// who made a CS: its maker, its last editor and who sent it – none of them approves it
const makersOf = cs => [...new Set([cs.created_by, cs.updated_by, cs.sent_by].map(lower).filter(Boolean))];
/* may this person decide this CS now? (s: the sign-in – email, role super / admin / user, site) → { may, why } */
function mayDecide(cs, s) {
  if (!cs || cs.status !== 'Sent') return { may: false, why: 'It is not waiting for approval.' };
  if (makersOf(cs).indexOf(lower(s.email)) > -1) return { may: false, why: 'Nobody approves his own CS (made, changed or sent by you).' };
  if (s.role === 'super') return { may: true, why: '' };
  if (cs.need === 'super') return { may: false, why: 'Above the limit – the Super Admin approves it.' };
  if (s.role !== 'admin') return { may: false, why: 'A Purchase Admin approves it.' };
  if (s.site !== cs.site) return { may: false, why: 'A Purchase Admin of ' + cs.site + ' approves it – open Purchase on ' + cs.site + ' (Change site).' };
  return { may: true, why: '' };
}
const ACTS = { approve: 'Approved', back: 'Sent back', reject: 'Rejected' };

/* ---------- PURCHASE PHASE 2 – THE PURCHASE ORDER (10-11-2026) ----------
 * The owner's decisions: D-2 – the PO's master copy is kept here (Purchase); the site keeps a copy in its own Store, written only
 * through the Store's own server. G-6 – no extra approval after the CS's final approval: a PO of an approved CS is approved. P2 – the
 * award is item-wise: ONE PO A SUPPLIER × SITE (one CS can give several POs). Each line keeps its site's requirement and line (the
 * Store counts it as ordered – the Inbox's "left" falls by itself). */
const poNoOf = n => 'PO-' + String(n).padStart(4, '0');
const dayIST = t => { const d = Date.parse(t); return isNaN(d) ? String(t || '').slice(0, 10) : new Date(d + 330 * 60000).toISOString().slice(0, 10); };
// a text of several lines (an address, the terms): each line cleaned, empty lines left out
const linesText = (v, n) => String(v === undefined || v === null ? '' : v).split(/\r?\n/).map(l => clean(l, 400)).filter(Boolean).join('\n').slice(0, n || 300);
// the award of an approved CS as POs: each supplier × site its lines (in the CS's order); suppliers by name, then the site
function poGroups(sheet, award) {
  const a = award || {}, by = new Map(), names = {};
  ((sheet && sheet.vendors) || []).forEach(v => { names[v.id] = v.name; });
  ((sheet && sheet.lines) || []).forEach(L => {
    const x = a[L.line] || a[String(L.line)], v = x && x.vendor !== undefined && x.vendor !== null && x.vendor !== '' ? Number(x.vendor) : null;
    if (v === null || !L.q || !L.q[v]) return;
    const k = v + '|' + L.site; if (!by.has(k)) by.set(k, { vendor: v, vendor_name: names[v] || '', site: L.site, lines: [] });
    by.get(k).lines.push(L);
  });
  return [...by.values()].sort((x, y) => x.vendor_name.localeCompare(y.vendor_name) || x.vendor - y.vendor || x.site.localeCompare(y.site));
}
/* the lines and money of ONE PO (a supplier × site of an approved CS) – as the company's PO (the Store's PO: lib/work.js checkPo):
 * a line's amount = qty × rate (to the paisa) less its Disc. %, GST on that amount, its total; the PO's total = the lines + freight +
 * loading. Rate, Disc. % and GST % as in his quotation (the CS); a GST % he did not give is typed on the PO (gst: { csLine: % }) – else
 * the line is listed in "missing". Freight and loading of his quotation as the CS spreads them: the part of his quoted lines' value
 * (rate less Disc. % × qty) that these lines are (all his quoted lines in this PO: the whole freight and loading). The CS's landed rate
 * and amount stay on each line (landed, landed_value). */
function poMoney(sheet, award, vendor, site, gst) {
  const g = (gst && typeof gst === 'object') ? gst : {}, vid = Number(vendor);
  const grp = poGroups(sheet, award).find(x => x.vendor === vid && x.site === String(site));
  if (!grp) err('This supplier has no line of site ' + site + ' in the award.');
  const V = ((sheet && sheet.vendors) || []).find(v => Number(v.id) === vid) || { freight: 0, loading: 0 };
  const netQty = L => { const q = L.q[vid]; return num(q.rate) * (1 - num(q.disc) / 100) * num(L.qty); };
  const quoted = ((sheet && sheet.lines) || []).filter(L => L.q && L.q[vid]), all = quoted.reduce((s, L) => s + netQty(L), 0), mine = grp.lines.reduce((s, L) => s + netQty(L), 0);
  const share = grp.lines.length === quoted.length ? 1 : all > 0 ? mine / all : 0;
  const missing = [], lines = grp.lines.map((L, i) => {
    const q = L.q[vid], typed = g[L.line] !== undefined ? g[L.line] : g[String(L.line)];
    let pct = q.gst === null || q.gst === undefined || q.gst === '' ? null : num(q.gst);
    if (pct === null && typed !== undefined && typed !== null && String(typed).trim() !== '') pct = r2(numIn(typed, 'GST % of line ' + L.line + ' (' + L.name + ')', 0, 40, null));
    if (pct === null) missing.push(L.line);
    const qty = r3(L.qty), rate = r2(q.rate), disc = r2(num(q.disc)), gross = r2(qty * rate), taxable = r2(gross * (100 - disc) / 100), tax = r2(taxable * num(pct) / 100);
    return { line: i + 1, cs_line: L.line, site: L.site, req_no: Number(L.req_no), req_line: Number(L.req_line), ref: L.ref || '', code: L.code || '', name: L.name || '', unit: L.unit || '',
      qty: qty, rate: rate, disc_pct: disc, gst_pct: pct, gst_quoted: q.gst !== null && q.gst !== undefined && q.gst !== '', disc: r2(gross - taxable), taxable: taxable, gst: tax, total: r2(taxable + tax),
      landed: r2(q.landed), landed_value: r2(q.value), days: q.days === null || q.days === undefined ? null : Number(q.days), brand: L.brand || '', spec: L.spec || '' };
  });
  const sum = k => r2(lines.reduce((s, l) => s + num(l[k]), 0)), freight = r2(num(V.freight) * share), loading = r2(num(V.loading) * share);
  return { vendor: vid, vendor_name: grp.vendor_name, site: grp.site, lines: lines, freight: freight, loading: loading, taxable: sum('taxable'), gst: sum('gst'), disc: sum('disc'),
    total: r2(sum('total') + freight + loading), landed: sum('landed_value'), missing: missing, pay_terms: V.pay_terms || '' };
}
// what the PO form sent: its date (not after today, not before its CS was approved), delivery by, payment terms, the site's shipping
// address and contact, the terms (line by line), a remark
function checkPoHead(x, opt) {
  x = x || {}; opt = opt || {};
  const date = dayOf(x.date, 'PO date'), need = dayOf(x.need_by, 'delivery date', { optional: true, future: true });
  if (opt.approved && date < opt.approved) err('The PO date ' + dmy(date) + ' is before its CS was approved (' + dmy(opt.approved) + ').');
  if (need && need < date) err('The delivery date ' + dmy(need) + ' is before the PO date ' + dmy(date) + '.');
  const ship = linesText(x.ship_to, 300); if (ship.length < 3) err('Enter the shipping address (where the material is delivered).');
  return { date: date, need_by: need, pay_terms: clean(x.pay_terms, 200), ship_to: ship, site_contact: clean(x.site_contact, 120), terms: linesText(x.terms, 3000), remark: clean(x.remark, 300) };
}
/* a PO's state as the list shows it: Cancelled; Not yet at the site (its copy is not in the site's Store yet – Send again); At the
 * site; Partly received / Received (the GRNs at the site); site: the copy as the site's Store has it (null: not known now) */
function poState(po, site) {
  if (!po || po.status === 'Cancelled') return 'Cancelled';
  if (!po.sent_rev || Number(po.sent_rev) < Number(po.rev || 1)) return 'Not yet at the site';
  const st = site && site.state;
  return st === 'Part received' ? 'Partly received' : st === 'Received' ? 'Received' : st === 'Closed' ? 'Closed at the site' : st === 'Cancelled' ? 'Cancelled at the site' : 'At the site';
}
// an amount in words, the Indian way ("Two Lakhs Twenty Five Thousand Six Hundred and Ninety Nine Only") – as the company's PO paper (the Store's)
const ONES_ = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS_ = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two_ = n => n < 20 ? ONES_[n] : TENS_[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES_[n % 10] : '');
const three_ = n => { const h = Math.floor(n / 100), r = n % 100; return (h ? ONES_[h] + ' Hundred' + (r ? ' and ' : '') : '') + (r ? two_(r) : ''); };
function wordsOf_(n) {
  if (!n) return '';
  const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3;
  return [cr ? wordsOf_(cr) + (cr > 1 ? ' Crores' : ' Crore') : '', lk ? two_(lk) + (lk > 1 ? ' Lakhs' : ' Lakh') : '', th ? two_(th) + ' Thousand' : '', three_(n)].filter(Boolean).join(' ');
}
function inWords(amount) {
  const v = Math.round(Math.abs(Number(amount) || 0) * 100), rupees = Math.floor(v / 100), paise = v % 100;
  return (wordsOf_(rupees) || 'Zero') + (paise ? ' and ' + two_(paise) + ' Paise' : '') + ' Only';
}
// the copy for the site's Store (its server checks it again – the same figures, the requirement's line and item)
const poCopy = (po, by) => ({ pur_no: Number(po.no), rev: Number(po.rev || 1), ref: poNoOf(po.no), date: po.date, deliver_by: po.need_by || null,
  vendor: { name: (po.vendor || {}).name || '', gstin: (po.vendor || {}).gstin || '', pan: (po.vendor || {}).pan || '', address: (po.vendor || {}).address || '', phone: (po.vendor || {}).phone || '', email: (po.vendor || {}).email || '' },
  lines: (po.lines || []).map(l => ({ code: l.code, qty: l.qty, rate: l.rate, disc_pct: l.disc_pct, gst_pct: l.gst_pct, req_no: l.req_no, req_line: l.req_line, brand: l.brand || '', spec: l.spec || '' })),
  freight: num(po.freight), loading: num(po.loading), ship_to: po.ship_to || '', site_contact: po.site_contact || '', terms: po.terms || '', remark: po.remark || '', pay_terms: po.pay_terms || '',
  totals: { taxable: num(po.taxable), gst: num(po.gst), total: num(po.total) },
  cs: { no: Number(po.cs_no), ref: csNoOf(po.cs_no), approved_by: (po.cs || {}).by || '', approved_name: (po.cs || {}).name || '', approved_at: (po.cs || {}).at || null },
  rfq: { no: Number(po.rfq_no), ref: noOf(po.rfq_no) }, by: { email: (by && by.email) || '', name: (by && by.name) || '' } });

/* the requirement lines in an OPEN enquiry, or awarded (its CS approved): line → { rfq, status, cs }; (Phase 2) a line of an award
 * whose PO is made: its PO (status "PO-0001") – a cancelled PO frees its lines (they are ordered again from the Inbox).
 * pos: { csNo: [{ no, vendor_id, site, status, sent_rev, rev }] }; an awarded CS needs its award (line → vendor) */
function takenOfPo(rfqs, csOf, pos) {
  const P = pos || {};
  const poOf = (r, l) => { const c = csOf && csOf[r.no]; if (!c || c.status !== 'Approved' || r.status !== 'Closed') return null;
    const a = c.award && (c.award[l.line] || c.award[String(l.line)]), v = a ? Number(a.vendor) : null;
    return v === null ? null : (P[c.no] || []).find(p => Number(p.vendor_id) === v && p.site === l.site) || null; };
  // a line whose PO is cancelled is free (left out); the open enquiries last – a line asked again after its PO was cancelled is theirs
  const kept = (rfqs || []).map(r => Object.assign({}, r, { lines: (r.lines || []).filter(l => { const p = poOf(r, l); return !(p && p.status === 'Cancelled'); }) }));
  const out = takenOf(kept.filter(r => r.status === 'Closed').concat(kept.filter(r => r.status !== 'Closed')), csOf);
  kept.forEach(r => (r.lines || []).forEach(l => {
    const k = lineKey(l.site, l.req_no, l.req_line), po = poOf(r, l);
    if (po && out[k] && Number(out[k].rfq) === Number(r.no)) out[k] = Object.assign({}, out[k], { status: poNoOf(po.no), po: Number(po.no), sent: !!po.sent_rev && Number(po.sent_rev) >= Number(po.rev || 1) });
  }));
  return out;
}

module.exports = { r2, r3, num, today, dmy, clean, keyOf, lower, noOf, csNoOf, dayOf, numIn, RuleError, GSTIN, PAN, checkVendor, waOf, lineKey, checkRfq, rfqLines, takenOf,
  checkQuote, quoteWas, compare, awardL1, awardOf, needOf, makersOf, mayDecide, ACTS,
  poNoOf, dayIST, linesText, poGroups, poMoney, checkPoHead, poState, poCopy, takenOfPo, inWords };
