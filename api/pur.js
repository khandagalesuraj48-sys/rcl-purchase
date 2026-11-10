/* POST /api/pur { action, … } – PURCHASE PHASE 1 (09-11-2026): suppliers, the Inbox (the sites' approved requirement lines still to
 * order – asked of the Store's own server), enquiries (RFQ), quotations, the comparative statement (CS) and its approval, the CS limit.
 * PURCHASE PHASE 2 (10-11-2026): the purchase order – one a supplier × site of an approved CS (approved with it – G-6); its master here,
 * its copy at the site's Store (D-2 – lib/storelink.js po); its GRNs and balance read from there; Send again; Cancel (no GRN yet).
 * Written fresh for RCL. The sign-in (cookie) says who, which site, which role (super / admin / user – the Portal's) and every site
 * where he has Purchase (the Portal's ticket). Every check is here, on the server (lib/rules.js holds the rules themselves); every save
 * writes pur_activity.
 *   a Purchase User   – suppliers (add, change), enquiries, quotations, the CS (make, award, send)
 *   a Purchase User   – (Phase 2) a PO of his site from an approved CS; Send again
 *   a Purchase Admin  – the same; a supplier Blocked / Approved again; approves a CS of his site up to the limit; (Phase 2) cancels a PO
 *   the Super Admin   – everything; approves any CS (above the limit only he); sets the limit (Settings)
 * Never his own: who made, last changed or sent a CS does not approve it. A person sees and works only on what is of his sites (an
 * enquiry's own site and the sites of its lines). */
'use strict';
const { handler, readBody, send, sameSite, fail } = require('../lib/http');
const { db } = require('../lib/db');
const ses = require('../lib/session');
const { activity } = require('../lib/activity');
const R = require('../lib/rules');
const link = require('../lib/storelink');

const nowIso = () => new Date().toISOString();
const isSuper = s => s.role === 'super';
const isAdmin = s => s.role === 'super' || s.role === 'admin';
// the sites where this person has Purchase (the Portal's ticket: his sign-in's site and his other sites); the Super Admin: every site
const siteList = s => [...new Set([s.site].concat(((s.info && s.info.sites) || []).map(x => x.code)).filter(Boolean))];
const sitesOf = s => isSuper(s) ? null : new Set(siteList(s));
const mayAll = (s, codes) => { const m = sitesOf(s); return !m || codes.every(c => m.has(c)); };
const rfqSites = r => [...new Set([r.site].concat((r.lines || []).map(l => l.site)))];
const userErr = e => { if (e && e.user) throw fail(400, e.message, 'field'); throw e; };
const rule = f => { try { return f(); } catch (e) { return userErr(e); } };
const noOf = v => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw fail(400, 'No proper number.', 'field'); return n; };
const CHANGED = 'It was changed by someone else just now – it is loaded again: look and save once more.';
const gone = what => fail(404, what + ' is not there – refresh.', 'gone');
const STEP2 = 'Purchase\'s database step 2 is not run yet: the Super Admin runs sql/pur_step2_rfq_cs.sql once in the rcl-purchase Supabase → SQL Editor. Until then only the Dashboard works.';
const OPEN = ['Draft', 'Sent', 'Quotes in'];
const inList = l => 'in.(' + l.map(v => '"' + v + '"').join(',') + ')';
// every row of a question, 1000 at a time (the database gives at most 1000 in one answer)
async function all(path) {
  const out = [];
  for (let off = 0; off < 200000; off += 1000) { const r = (await db('GET', path + '&limit=1000&offset=' + off)) || []; out.push(...r); if (r.length < 1000) break; }
  return out;
}

/* ---------- what is read ---------- */
// the CS limit (₹) the Super Admin set – for every site; none yet: null (every CS then goes to the Super Admin)
async function limitOf() {
  const r = ((await db('GET', 'pur_settings?select=value,updated_by,updated_at&site=eq.' + encodeURIComponent('*') + '&id=eq.cs_limit')) || [])[0];
  const v = r && r.value && r.value.amount;
  return { limit: v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v), by: r ? r.updated_by || '' : '', at: r ? r.updated_at : null };
}
const VCOLS = 'id,name,gstin,pan,address,phone,email,supplies,status,status_note,created_by,created_name,created_at,updated_by,updated_at,ver';
const vendorsAll = () => all('pur_vendors?select=' + VCOLS + '&site=eq.' + encodeURIComponent('*') + '&order=name.asc,id.asc');
const vendorOut = v => Object.assign({}, v, { id: Number(v.id), wa: R.waOf(v.phone) });
async function rfqOf(s, no) {
  const r = ((await db('GET', 'pur_rfq?select=*&no=eq.' + no)) || [])[0];
  if (!r) throw gone(R.noOf(no));
  if (!mayAll(s, rfqSites(r))) throw fail(403, R.noOf(no) + ' has lines of a site where you have no Purchase.', 'access');
  r.no = Number(r.no); return r;
}
const csOfRfq = async no => { const c = ((await db('GET', 'pur_cs?select=*&rfq_no=eq.' + Number(no))) || [])[0] || null; if (c) c.no = Number(c.no); return c; };
const quotesOf = no => db('GET', 'pur_quote?select=vendor_id,vendor_name,lines,freight,loading,pay_terms,valid_till,remark,locked&rfq_no=eq.' + Number(no) + '&order=vendor_id.asc').then(r => r || []);
/* the requirement lines in an open enquiry (or awarded: its CS approved) – a line is asked once; (10-11-2026, Phase 2) a line of an
 * award whose PO is made shows its PO; a cancelled PO frees its lines */
async function takenNow() {
  const [open, ok] = await Promise.all([all('pur_rfq?select=no,status,lines&status=' + encodeURIComponent(inList(OPEN)) + '&order=no.asc'), all('pur_cs?select=no,rfq_no,status,award&status=eq.Approved&order=no.asc')]);
  const csOf = {}; ok.forEach(c => { c.no = Number(c.no); csOf[c.rfq_no] = c; });
  const closed = ok.length ? await all('pur_rfq?select=no,status,lines&status=eq.Closed&no=in.(' + ok.map(c => Number(c.rfq_no)).join(',') + ')&order=no.asc') : [];
  const pos = {}; (ok.length ? await poAll('&cs_no=in.(' + ok.map(c => c.no).join(',') + ')') : []).forEach(p => { (pos[p.cs_no] = pos[p.cs_no] || []).push(p); });
  return R.takenOfPo(open.concat(closed), csOf, pos);
}
/* (10-11-2026) the POs (step 3) – before step 3 is run: none (Phase 1 works as before) */
const POSEL = 'no,rev,site,cs_no,rfq_no,vendor_id,vendor,date,need_by,lines,freight,loading,taxable,gst,total,pay_terms,ship_to,site_contact,terms,remark,cs,status,status_note,cancelled_by,cancelled_name,cancelled_at,sent_rev,store_no,sent_at,send_error,send_tries,send_at,created_by,created_name,created_at,updated_by,updated_at,ver';
const poNorm = p => Object.assign(p, { no: Number(p.no), rev: Number(p.rev || 1), cs_no: Number(p.cs_no), rfq_no: Number(p.rfq_no), vendor_id: Number(p.vendor_id), ver: Number(p.ver),
  sent_rev: p.sent_rev === null || p.sent_rev === undefined ? null : Number(p.sent_rev), store_no: p.store_no === null || p.store_no === undefined ? null : Number(p.store_no),
  freight: Number(p.freight) || 0, loading: Number(p.loading) || 0, taxable: Number(p.taxable) || 0, gst: Number(p.gst) || 0, total: Number(p.total) || 0, send_tries: Number(p.send_tries) || 0 });
async function poAll(q, lim) {
  try { return (lim ? (await db('GET', 'pur_po?select=' + POSEL + (q || '') + '&order=no.desc&limit=' + Number(lim))) || [] : await all('pur_po?select=' + POSEL + (q || '') + '&order=no.desc')).map(poNorm); }
  catch (e) { if (e && e.code === 'notinstalled') return []; throw e; }
}
const rfqOut = r => ({ no: Number(r.no), ref: R.noOf(r.no), site: r.site, date: r.date, need_by: r.need_by, remark: r.remark || '', lines: r.lines || [], vendors: r.vendors || [], status: r.status,
  status_note: r.status_note || '', sent_by: r.sent_by || '', sent_at: r.sent_at, created_by: r.created_by, created_name: r.created_name, created_at: r.created_at, updated_at: r.updated_at, ver: Number(r.ver) });
const csLocked = cs => !!cs && ['Sent', 'Approved', 'Rejected'].indexOf(cs.status) > -1;
function csView(cs, r, s, lim) {
  const d = R.mayDecide(cs, s), edit = ['Draft', 'Sent back'].indexOf(cs.status) > -1 && ['Sent', 'Quotes in'].indexOf(r.status) > -1;
  let problems = []; try { problems = R.awardOf(cs.sheet || {}, cs.award, cs.few_reason).problems; } catch (e) { problems = [String(e.message || e)]; }
  return { no: cs.no, ref: R.csNoOf(cs.no), rfq_no: Number(cs.rfq_no), rfq_ref: R.noOf(cs.rfq_no), site: cs.site, status: cs.status, sheet: cs.sheet, award: cs.award || {}, few_reason: cs.few_reason || '',
    total: Number(cs.total) || 0, gst: Number(cs.gst) || 0, need: cs.status === 'Draft' || cs.status === 'Sent back' ? R.needOf(cs.total, lim) : cs.need, cs_limit: cs.cs_limit === null ? null : Number(cs.cs_limit), limit: lim,
    trail: cs.trail || [], created_by: cs.created_by, created_name: cs.created_name, created_at: cs.created_at, updated_by: cs.updated_by, updated_name: cs.updated_name, updated_at: cs.updated_at,
    sent_name: cs.sent_name, sent_at: cs.sent_at, decided_name: cs.decided_name, decided_at: cs.decided_at, version: Number(cs.version),
    problems: problems, may: { edit: edit, send: edit && !problems.length, decide: d.may, why: d.why } };
}
// the Store's answer as one map: 'site:req:line' → the line with its requirement's Indent No. and need-by
function pendingMap(p) {
  const out = {};
  (p.sites || []).forEach(st => (st.reqs || []).forEach(r => (r.lines || []).forEach(l => { out[R.lineKey(st.site, r.no, l.line)] = Object.assign({ ref: r.ref || '', need_by: r.need_by || null }, l); })));
  return out;
}
const unlock = no => db('PATCH', 'pur_quote?rfq_no=eq.' + Number(no), { locked: false }, 'return=minimal');

const A = {
  /* ---------- SETTINGS: the CS limit (₹) – Super Admin only (every Purchase person sees it: who approves what) ---------- */
  async settings(s) { return Object.assign(await limitOf(), { maySet: isSuper(s) }); },
  async settingsSave(s, x) {
    if (!isSuper(s)) throw fail(403, 'Only the Super Admin sets the CS limit.', 'access');
    const v = rule(() => R.numIn(x.limit, 'The CS limit (₹)', 0, 1e12, null));
    if (v === null) throw fail(400, 'Enter the limit in ₹ (0 or more).', 'field');
    await db('POST', 'pur_settings?on_conflict=site,id', [{ site: '*', id: 'cs_limit', value: { amount: R.r2(v) }, updated_by: s.email, updated_at: nowIso() }], 'resolution=merge-duplicates,return=minimal');
    await activity(s.site, s.email, 'CS limit set', '*', { amount: R.r2(v) });
    return Object.assign({ saved: true, maySet: true }, await limitOf());
  },

  /* ---------- SUPPLIERS (Purchase's own list – one for every site) ---------- */
  async vendorList(s) { return { vendors: (await vendorsAll()).map(vendorOut), mayStatus: isAdmin(s) }; },
  async vendorSave(s, x) {
    const v = rule(() => R.checkVendor(x)), id = x.id ? noOf(x.id) : 0, list = await vendorsAll();
    const old = id ? list.find(y => Number(y.id) === id) : null;
    if (id && !old) throw gone('This supplier');
    const twin = list.find(y => Number(y.id) !== id && R.keyOf(y.name) === v.name_key);
    if (twin) throw fail(409, '"' + twin.name + '" is already a supplier – the same name is not saved twice.', 'duplicate');
    const twinG = v.gstin ? list.find(y => Number(y.id) !== id && y.gstin === v.gstin) : null;
    if (twinG) throw fail(409, 'GST no. ' + v.gstin + ' is already the supplier "' + twinG.name + '".', 'duplicate');
    if (!old) {
      let row;
      try { row = ((await db('POST', 'pur_vendors', [Object.assign({ site: '*', created_by: s.email, created_name: s.name, updated_by: s.email }, v)], 'return=representation')) || [])[0]; }
      catch (e) { if (e && e.code === 'duplicate') throw fail(409, 'This supplier (his name or GST no.) is already there – refresh the list.', 'duplicate'); throw e; }
      await activity(s.site, s.email, 'Supplier added', v.name, { id: Number(row.id), gstin: v.gstin });
      return { saved: true, vendor: vendorOut(row) };
    }
    if (Number(x.ver) !== Number(old.ver)) throw fail(409, CHANGED, 'changed');
    let r;
    try { r = await db('PATCH', 'pur_vendors?id=eq.' + id + '&ver=eq.' + Number(old.ver), Object.assign({}, v, { updated_by: s.email, updated_at: nowIso(), ver: Number(old.ver) + 1 }), 'return=representation'); }
    catch (e) { if (e && e.code === 'duplicate') throw fail(409, 'This name or GST no. is already another supplier.', 'duplicate'); throw e; }
    if (!r || !r.length) throw fail(409, CHANGED, 'changed');
    await activity(s.site, s.email, 'Supplier changed', v.name, { id: id, was: { name: old.name, gstin: old.gstin, phone: old.phone } });
    return { saved: true, vendor: vendorOut(r[0]) };
  },
  async vendorStatus(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only a Purchase Admin or the Super Admin blocks a supplier (or approves him again).', 'access');
    const id = noOf(x.id), st = x.status === 'Blocked' || x.status === 'Approved' ? x.status : '';
    if (!st) throw fail(400, 'Approved or Blocked?', 'field');
    const why = R.clean(x.why, 200);
    if (st === 'Blocked' && why.length < 3) throw fail(400, 'Write why the supplier is blocked.', 'field');
    const old = ((await db('GET', 'pur_vendors?select=' + VCOLS + '&id=eq.' + id)) || [])[0];
    if (!old) throw gone('This supplier');
    if (Number(x.ver) !== Number(old.ver)) throw fail(409, CHANGED, 'changed');
    const r = await db('PATCH', 'pur_vendors?id=eq.' + id + '&ver=eq.' + Number(old.ver), { status: st, status_note: st === 'Blocked' ? why : '', updated_by: s.email, updated_at: nowIso(), ver: Number(old.ver) + 1 }, 'return=representation');
    if (!r || !r.length) throw fail(409, CHANGED, 'changed');
    await activity(s.site, s.email, st === 'Blocked' ? 'Supplier blocked' : 'Supplier approved', old.name, { id: id, why: why });
    return { saved: true, vendor: vendorOut(r[0]) };
  },

  /* ---------- THE INBOX: the approved requirement lines of his sites still to order (the Store's own figures); a line already in an
   * open enquiry (or awarded) is shown with it – it is not asked twice ---------- */
  async inbox(s) {
    if (!link.linked()) return { link: false, error: link.NOT_SET, sites: [] };
    const [p, taken] = await Promise.all([link.pending(siteList(s)), takenNow()]);
    return { link: true, today: p.today || R.today(), sites: (p.sites || []).map(st => ({ site: st.site, name: st.name || st.site, own: !!st.own, error: st.error || '',
      reqs: (st.reqs || []).map(r => Object.assign({}, r, { lines: (r.lines || []).filter(l => Number(l.left) > 0.0005).map(l => Object.assign({}, l, { taken: taken[R.lineKey(st.site, r.no, l.line)] || null })) }))
        .filter(r => r.lines.length) })) };
  },

  /* ---------- ENQUIRIES (RFQ) ---------- */
  async rfqList(s, x) {
    const st = ['Draft', 'Sent', 'Quotes in', 'Closed', 'Cancelled'].indexOf(x.status) > -1 ? '&status=eq.' + encodeURIComponent(x.status) : '';
    const rows = ((await db('GET', 'pur_rfq?select=no,site,date,need_by,lines,vendors,status,status_note,sent_at,created_by,created_name,created_at,updated_at,ver' + st + '&order=no.desc&limit=300')) || []).filter(r => mayAll(s, rfqSites(r)));
    const nos = rows.map(r => Number(r.no)), q = {}, c = {};
    if (nos.length) {
      ((await db('GET', 'pur_quote?select=rfq_no,vendor_id&rfq_no=in.(' + nos.join(',') + ')')) || []).forEach(y => { q[y.rfq_no] = (q[y.rfq_no] || 0) + 1; });
      ((await db('GET', 'pur_cs?select=no,rfq_no,status,total&rfq_no=in.(' + nos.join(',') + ')')) || []).forEach(y => { c[y.rfq_no] = { no: Number(y.no), ref: R.csNoOf(y.no), status: y.status, total: Number(y.total) || 0, pos: [] }; });
      // (10-11-2026, Phase 2) an approved CS: its POs (not cancelled)
      const ap = Object.values(c).filter(y => y.status === 'Approved'), by = {}; ap.forEach(y => { by[y.no] = y; });
      if (ap.length) (await poAll('&cs_no=in.(' + ap.map(y => y.no).join(',') + ')')).filter(p => p.status !== 'Cancelled').forEach(p => { if (by[p.cs_no]) by[p.cs_no].pos.push(R.poNoOf(p.no)); });
      ap.forEach(y => y.pos.sort());
    }
    return { rfqs: rows.map(r => Object.assign(rfqOut(r), { lines: undefined, nlines: (r.lines || []).length, items: (r.lines || []).slice(0, 3).map(l => l.name).join(', ') + ((r.lines || []).length > 3 ? ' …' : ''),
      sites: rfqSites(r), quotes: q[r.no] || 0, cs: c[r.no] || null })) };
  },
  async rfqGet(s, x) {
    const r = await rfqOf(s, noOf(x.no));
    const [vend, qs, cs] = await Promise.all([vendorsAll(), db('GET', 'pur_quote?select=id,vendor_id,vendor_name,updated_at,updated_name,locked,ver&rfq_no=eq.' + r.no), csOfRfq(r.no)]);
    const open = OPEN.indexOf(r.status) > -1 && !csLocked(cs), mine = R.lower(r.created_by) === R.lower(s.email);
    return { rfq: rfqOut(r),
      vendors: (r.vendors || []).map(y => { const v = vend.find(z => Number(z.id) === Number(y.id)) || {}, q = (qs || []).find(z => Number(z.vendor_id) === Number(y.id));
        return { id: Number(y.id), name: v.name || y.name, phone: v.phone || '', wa: R.waOf(v.phone), email: v.email || '', address: v.address || '', gstin: v.gstin || '', status: v.status || '',
          quote: q ? { at: q.updated_at, by: q.updated_name, locked: !!q.locked } : null }; }),
      cs: cs ? { no: cs.no, ref: R.csNoOf(cs.no), status: cs.status, total: Number(cs.total) || 0 } : null,
      may: { edit: open, send: r.status === 'Draft', cancel: open && (mine || isAdmin(s)), quote: ['Sent', 'Quotes in'].indexOf(r.status) > -1 && !csLocked(cs), cs: ['Sent', 'Quotes in'].indexOf(r.status) > -1 && (qs || []).length > 0 } };
  },
  async rfqSave(s, x) {
    const v = rule(() => R.checkRfq(x)), no = x.no ? noOf(x.no) : 0;
    const old = no ? await rfqOf(s, no) : null;
    if (old) {
      if (OPEN.indexOf(old.status) === -1) throw fail(409, R.noOf(no) + ' is ' + old.status + ' – it is not changed.', 'state');
      const cs = await csOfRfq(no);
      if (csLocked(cs)) throw fail(409, 'Its CS is ' + cs.status.toLowerCase() + ' – the enquiry is not changed.', 'state');
      if (Number(x.ver) !== Number(old.ver)) throw fail(409, CHANGED, 'changed');
    }
    // its lines: a new line, or more than before, is asked of the Store (approved, still to order); one it has stays as it is
    const had = new Map((old ? old.lines : []).map(l => [R.lineKey(l.site, l.req_no, l.req_line), l]));
    const ask = v.lines.filter(a => { const h = had.get(R.lineKey(a.site, a.req_no, a.req_line)); return !h || a.qty > Number(h.qty) + 0.0005; });
    const mine = sitesOf(s);
    ask.forEach((a, i) => { if (mine && !mine.has(a.site)) throw fail(403, 'Site ' + a.site + ': you have no Purchase there.', 'access'); });
    const pending = ask.length ? pendingMap(await link.pending([...new Set(ask.map(a => a.site))])) : {};
    const lines = rule(() => R.rfqLines(v.lines, pending, {}, old ? old.lines : [], mine, no));
    // a line asked once (read last, just before the save)
    const taken = await takenNow();
    lines.forEach((l, i) => { const t = taken[R.lineKey(l.site, l.req_no, l.req_line)]; if (t && Number(t.rfq) !== no) throw fail(409, 'Line ' + (i + 1) + ' (' + l.name + ', requirement ' + l.req_no + ' of ' + l.site + ') is already in ' + R.noOf(t.rfq) + ' – one line is asked once.', 'taken'); });
    // the suppliers: Approved ones (one asked before and blocked since stays); one who gave a quotation stays asked
    const vend = await vendorsAll(), was = new Set((old ? old.vendors : []).map(y => Number(y.id)));
    const vendors = v.vendors.map(id => { const y = vend.find(z => Number(z.id) === id);
      if (!y) throw fail(400, 'A supplier picked is not in the list – refresh.', 'field');
      if (y.status !== 'Approved' && !was.has(id)) throw fail(400, '"' + y.name + '" is Blocked – pick another supplier.', 'field');
      return { id: id, name: y.name }; });
    if (old) ((await db('GET', 'pur_quote?select=vendor_id,vendor_name&rfq_no=eq.' + no)) || []).forEach(q => { if (!vendors.some(y => y.id === Number(q.vendor_id))) throw fail(400, '"' + q.vendor_name + '" has given a quotation – he stays on the enquiry.', 'field'); });
    const row = { date: v.date, need_by: v.need_by, remark: v.remark, lines: lines, vendors: vendors, updated_by: s.email, updated_at: nowIso() };
    if (!old) {
      const n = Number(await db('POST', 'rpc/pur_next_no', { p_kind: 'RFQ' }));
      if (!Number.isInteger(n) || n < 1) throw fail(500, 'No number could be given – try again.');
      await db('POST', 'pur_rfq', [Object.assign({ no: n, site: s.site, status: 'Draft', created_by: s.email, created_name: s.name }, row)], 'return=minimal');
      await activity(s.site, s.email, 'Enquiry made', R.noOf(n), { lines: lines.length, vendors: vendors.map(y => y.name), sites: rfqSites({ site: s.site, lines: lines }) });
      return Object.assign({ saved: true }, await A.rfqGet(s, { no: n }));
    }
    const r = await db('PATCH', 'pur_rfq?no=eq.' + no + '&ver=eq.' + Number(old.ver), Object.assign(row, { ver: Number(old.ver) + 1 }), 'return=representation');
    if (!r || !r.length) throw fail(409, CHANGED, 'changed');
    await activity(old.site, s.email, 'Enquiry changed', R.noOf(no), { lines: lines.length, vendors: vendors.map(y => y.name) });
    return Object.assign({ saved: true }, await A.rfqGet(s, { no: no }));
  },
  // sent to the suppliers (the page then prints it / shares it on WhatsApp – no e-mail)
  async rfqSend(s, x) {
    const r = await rfqOf(s, noOf(x.no));
    if (r.status !== 'Draft') throw fail(409, R.noOf(r.no) + ' is ' + r.status + ' already.', 'state');
    if (Number(x.ver) !== Number(r.ver)) throw fail(409, CHANGED, 'changed');
    const u = await db('PATCH', 'pur_rfq?no=eq.' + r.no + '&ver=eq.' + Number(r.ver) + '&status=eq.Draft', { status: 'Sent', sent_by: s.email, sent_at: nowIso(), updated_by: s.email, updated_at: nowIso(), ver: Number(r.ver) + 1 }, 'return=representation');
    if (!u || !u.length) throw fail(409, CHANGED, 'changed');
    await activity(r.site, s.email, 'Enquiry sent', R.noOf(r.no), { vendors: (r.vendors || []).map(y => y.name) });
    return Object.assign({ saved: true }, await A.rfqGet(s, { no: r.no }));
  },
  async rfqCancel(s, x) {
    const r = await rfqOf(s, noOf(x.no)), cs = await csOfRfq(r.no);
    if (OPEN.indexOf(r.status) === -1) throw fail(409, R.noOf(r.no) + ' is ' + r.status + ' – it is not cancelled.', 'state');
    if (csLocked(cs)) throw fail(409, 'Its CS is ' + cs.status.toLowerCase() + ' – the enquiry is not cancelled.', 'state');
    if (R.lower(r.created_by) !== R.lower(s.email) && !isAdmin(s)) throw fail(403, 'Only who made it, a Purchase Admin or the Super Admin cancels an enquiry.', 'access');
    const why = R.clean(x.why, 200); if (why.length < 3) throw fail(400, 'Write why it is cancelled.', 'field');
    if (Number(x.ver) !== Number(r.ver)) throw fail(409, CHANGED, 'changed');
    const u = await db('PATCH', 'pur_rfq?no=eq.' + r.no + '&ver=eq.' + Number(r.ver), { status: 'Cancelled', status_note: why, updated_by: s.email, updated_at: nowIso(), ver: Number(r.ver) + 1 }, 'return=representation');
    if (!u || !u.length) throw fail(409, CHANGED, 'changed');
    await activity(r.site, s.email, 'Enquiry cancelled', R.noOf(r.no), { why: why });
    return Object.assign({ saved: true }, await A.rfqGet(s, { no: r.no }));
  },

  /* ---------- QUOTATIONS (one supplier, one enquiry) – every change keeps the version before it; locked once its CS is sent ---------- */
  async quoteGet(s, x) {
    const r = await rfqOf(s, noOf(x.rfq)), vid = noOf(x.vendor);
    const y = (r.vendors || []).find(z => Number(z.id) === vid);
    if (!y) throw fail(400, 'This supplier is not asked in ' + R.noOf(r.no) + ' – add him to the enquiry first (Change).', 'field');
    const [q, cs] = await Promise.all([db('GET', 'pur_quote?select=*&rfq_no=eq.' + r.no + '&vendor_id=eq.' + vid).then(a => (a || [])[0] || null), csOfRfq(r.no)]);
    return { rfq: rfqOut(r), vendor: { id: vid, name: y.name }, quote: q ? Object.assign({}, q, { id: Number(q.id), ver: Number(q.ver) }) : null,
      may: { save: ['Sent', 'Quotes in'].indexOf(r.status) > -1 && !csLocked(cs) && !(q && q.locked) }, cs: cs ? { no: cs.no, ref: R.csNoOf(cs.no), status: cs.status } : null };
  },
  async quoteSave(s, x) {
    const r = await rfqOf(s, noOf(x.rfq)), vid = noOf(x.vendor);
    const y = (r.vendors || []).find(z => Number(z.id) === vid);
    if (!y) throw fail(400, 'This supplier is not asked in ' + R.noOf(r.no) + ' – add him to the enquiry first (Change).', 'field');
    if (r.status === 'Draft') throw fail(409, 'Mark ' + R.noOf(r.no) + ' as sent first – a quotation comes after the enquiry is sent.', 'state');
    if (['Sent', 'Quotes in'].indexOf(r.status) === -1) throw fail(409, R.noOf(r.no) + ' is ' + r.status + ' – no quotation is entered now.', 'state');
    const cs = await csOfRfq(r.no);
    if (csLocked(cs)) throw fail(409, 'Its CS ' + R.csNoOf(cs.no) + ' is ' + cs.status.toLowerCase() + ' – the quotations are locked.', 'locked');
    const v = rule(() => R.checkQuote(x, r.lines));
    const old = ((await db('GET', 'pur_quote?select=*&rfq_no=eq.' + r.no + '&vendor_id=eq.' + vid)) || [])[0];
    let out;
    if (!old) {
      try { out = ((await db('POST', 'pur_quote', [Object.assign({ rfq_no: r.no, vendor_id: vid, site: r.site, vendor_name: y.name, created_by: s.email, created_name: s.name, updated_by: s.email, updated_name: s.name }, v)], 'return=representation')) || [])[0]; }
      catch (e) { if (e && e.code === 'duplicate') throw fail(409, CHANGED, 'changed'); throw e; }
    } else {
      if (old.locked) throw fail(409, 'This quotation is locked (its CS was sent).', 'locked');
      if (Number(x.ver) !== Number(old.ver)) throw fail(409, CHANGED, 'changed');
      const history = (Array.isArray(old.history) ? old.history : []).concat([R.quoteWas(old)]).slice(-100);
      const u = await db('PATCH', 'pur_quote?id=eq.' + Number(old.id) + '&ver=eq.' + Number(old.ver) + '&locked=eq.false', Object.assign({}, v, { history: history, updated_by: s.email, updated_name: s.name, updated_at: nowIso(), ver: Number(old.ver) + 1 }), 'return=representation');
      if (!u || !u.length) throw fail(409, CHANGED, 'changed');
      out = u[0];
    }
    if (r.status === 'Sent') await db('PATCH', 'pur_rfq?no=eq.' + r.no + '&status=eq.Sent', { status: 'Quotes in' }, 'return=minimal');
    await activity(r.site, s.email, old ? 'Quotation changed' : 'Quotation entered', R.noOf(r.no) + ' · ' + y.name, { lines: v.lines.length, freight: v.freight, loading: v.loading });
    return Object.assign({ saved: true }, await A.quoteGet(s, { rfq: r.no, vendor: vid }), { id: Number(out.id) });
  },

  /* ---------- THE COMPARATIVE STATEMENT (CS) ---------- */
  // made (or worked out again while Draft / Sent back) from the quotations as they are now; the award kept where it still holds, a line
  // not given yet goes to its L1
  async csMake(s, x) {
    const r = await rfqOf(s, noOf(x.rfq));
    if (['Sent', 'Quotes in'].indexOf(r.status) === -1) throw fail(409, R.noOf(r.no) + ' is ' + r.status + ' – no CS is made now.', 'state');
    const [qs, old] = await Promise.all([quotesOf(r.no), csOfRfq(r.no)]);
    if (!qs.length) throw fail(400, 'No quotation is entered for ' + R.noOf(r.no) + ' yet.', 'field');
    if (old && ['Draft', 'Sent back'].indexOf(old.status) === -1) throw fail(409, R.csNoOf(old.no) + ' is ' + old.status + ' – it is not made again.', 'state');
    if (old && x.version !== undefined && Number(x.version) !== Number(old.version)) throw fail(409, CHANGED, 'changed');
    const sheet = R.compare(r, qs), first = R.awardL1(sheet), keep = {};
    sheet.lines.forEach(L => { const a = old && old.award ? old.award[L.line] : null; const k = a && L.q[a.vendor] ? a : first[L.line]; if (k) keep[L.line] = k; });
    const chk = R.awardOf(sheet, keep, old ? old.few_reason : '');
    const set = { sheet: sheet, award: chk.award, total: chk.total, gst: chk.gst, updated_by: s.email, updated_name: s.name, updated_at: nowIso() };
    if (!old) {
      const n = Number(await db('POST', 'rpc/pur_next_no', { p_kind: 'CS' }));
      if (!Number.isInteger(n) || n < 1) throw fail(500, 'No number could be given – try again.');
      try { await db('POST', 'pur_cs', [Object.assign({ no: n, rfq_no: r.no, site: r.site, status: 'Draft', created_by: s.email, created_name: s.name }, set)], 'return=minimal'); }
      catch (e) { if (e && e.code === 'duplicate') throw fail(409, 'The CS of ' + R.noOf(r.no) + ' was made by someone else just now – it is loaded.', 'changed'); throw e; }
      await activity(r.site, s.email, 'CS made', R.csNoOf(n), { rfq: R.noOf(r.no), total: chk.total, quotes: qs.length });
    } else {
      const u = await db('PATCH', 'pur_cs?no=eq.' + old.no + '&version=eq.' + Number(old.version) + '&status=' + encodeURIComponent(inList(['Draft', 'Sent back'])), Object.assign(set, { version: Number(old.version) + 1 }), 'return=representation');
      if (!u || !u.length) throw fail(409, CHANGED, 'changed');
      await activity(r.site, s.email, 'CS worked out again', R.csNoOf(old.no), { rfq: R.noOf(r.no), total: chk.total, quotes: qs.length });
    }
    return Object.assign({ saved: true }, await A.csGet(s, { rfq: r.no }));
  },
  async csGet(s, x) {
    let cs = null;
    if (x.no) { cs = ((await db('GET', 'pur_cs?select=*&no=eq.' + noOf(x.no))) || [])[0] || null; if (!cs) throw gone(R.csNoOf(noOf(x.no))); cs.no = Number(cs.no); }
    const r = await rfqOf(s, cs ? Number(cs.rfq_no) : noOf(x.rfq));
    if (!cs) cs = await csOfRfq(r.no);
    const lim = (await limitOf()).limit;
    if (!cs) return { cs: null, rfq: rfqOut(r), limit: lim, quotes: (await quotesOf(r.no)).length };
    return Object.assign({ cs: csView(cs, r, s, lim), rfq: rfqOut(r), limit: lim }, cs.status === 'Approved' ? { po: await csPos(s, cs) } : {});
  },
  // the award (each line its supplier; why, when not L1) and the reason for fewer than 2 quotations – Draft / Sent back only
  async csSave(s, x) {
    const cs = ((await db('GET', 'pur_cs?select=*&no=eq.' + noOf(x.no))) || [])[0];
    if (!cs) throw gone(R.csNoOf(noOf(x.no)));
    const r = await rfqOf(s, Number(cs.rfq_no));
    if (['Draft', 'Sent back'].indexOf(cs.status) === -1) throw fail(409, R.csNoOf(cs.no) + ' is ' + cs.status + ' – it is not changed.', 'state');
    if (Number(x.version) !== Number(cs.version)) throw fail(409, CHANGED, 'changed');
    const chk = rule(() => R.awardOf(cs.sheet || {}, x.award, x.few_reason));
    const u = await db('PATCH', 'pur_cs?no=eq.' + Number(cs.no) + '&version=eq.' + Number(cs.version), { award: chk.award, few_reason: chk.few, total: chk.total, gst: chk.gst, updated_by: s.email, updated_name: s.name, updated_at: nowIso(), version: Number(cs.version) + 1 }, 'return=representation');
    if (!u || !u.length) throw fail(409, CHANGED, 'changed');
    await activity(r.site, s.email, 'CS saved', R.csNoOf(cs.no), { total: chk.total, open: chk.problems.length });
    return Object.assign({ saved: true }, await A.csGet(s, { no: cs.no }));
  },
  /* sent for approval: the quotations are locked first, the comparison worked out from them as they are now (what is approved is what
   * was compared), every line given, the reasons there; who must approve is set by its amount (the limit now) */
  async csSend(s, x) {
    const cs = ((await db('GET', 'pur_cs?select=*&no=eq.' + noOf(x.no))) || [])[0];
    if (!cs) throw gone(R.csNoOf(noOf(x.no)));
    const r = await rfqOf(s, Number(cs.rfq_no));
    if (['Draft', 'Sent back'].indexOf(cs.status) === -1) throw fail(409, R.csNoOf(cs.no) + ' is ' + cs.status + ' already.', 'state');
    if (['Sent', 'Quotes in'].indexOf(r.status) === -1) throw fail(409, R.noOf(r.no) + ' is ' + r.status + ' – its CS is not sent.', 'state');
    if (Number(x.version) !== Number(cs.version)) throw fail(409, CHANGED, 'changed');
    await db('PATCH', 'pur_quote?rfq_no=eq.' + r.no, { locked: true }, 'return=minimal');
    let chk, sheet;
    try {
      sheet = R.compare(r, await quotesOf(r.no));
      chk = R.awardOf(sheet, x.award !== undefined ? x.award : cs.award, x.few_reason !== undefined ? x.few_reason : cs.few_reason);
    } catch (e) { await unlock(r.no).catch(() => {}); return userErr(e); }
    if (chk.problems.length) { await unlock(r.no).catch(() => {}); throw fail(400, 'Not sent: ' + chk.problems.join(' · '), 'field', { problems: chk.problems }); }
    const lim = (await limitOf()).limit, need = R.needOf(chk.total, lim), at = nowIso();
    const trail = (Array.isArray(cs.trail) ? cs.trail : []).concat([{ at: at, by: s.email, name: s.name, act: 'Sent', why: '', total: chk.total, need: need }]);
    const u = await db('PATCH', 'pur_cs?no=eq.' + Number(cs.no) + '&version=eq.' + Number(cs.version) + '&status=' + encodeURIComponent(inList(['Draft', 'Sent back'])),
      { sheet: sheet, award: chk.award, few_reason: chk.few, total: chk.total, gst: chk.gst, need: need, cs_limit: lim, status: 'Sent', trail: trail, sent_by: s.email, sent_name: s.name, sent_at: at,
        updated_by: x.award !== undefined || x.few_reason !== undefined ? s.email : cs.updated_by, updated_name: x.award !== undefined || x.few_reason !== undefined ? s.name : cs.updated_name, version: Number(cs.version) + 1 }, 'return=representation');
    if (!u || !u.length) { await unlock(r.no).catch(() => {}); throw fail(409, CHANGED, 'changed'); }
    await activity(r.site, s.email, 'CS sent for approval', R.csNoOf(cs.no), { rfq: R.noOf(r.no), total: chk.total, gst: chk.gst, need: need, limit: lim });
    return Object.assign({ saved: true }, await A.csGet(s, { no: cs.no }));
  },
  /* approve / send back (why) / reject (why) – by its amount (P1), never his own, on the version he saw (two decisions at the same moment:
   * the first counts, the second is told) */
  async csDecide(s, x) {
    const cs = ((await db('GET', 'pur_cs?select=*&no=eq.' + noOf(x.no))) || [])[0];
    if (!cs) throw gone(R.csNoOf(noOf(x.no)));
    cs.no = Number(cs.no);
    const r = await rfqOf(s, Number(cs.rfq_no)), act = Object.prototype.hasOwnProperty.call(R.ACTS, x.act) ? R.ACTS[x.act] : '';
    if (!act) throw fail(400, 'Approve, send back or reject?', 'field');
    const why = R.clean(x.why, 300);
    if (act !== 'Approved' && why.length < 3) throw fail(400, 'Write why it is ' + act.toLowerCase() + '.', 'field');
    if (Number(x.version) !== Number(cs.version)) throw fail(409, R.csNoOf(cs.no) + ' was changed or decided by someone else just now (' + cs.status + ') – it is loaded again.', 'changed');
    const d = R.mayDecide(cs, s);
    if (!d.may) throw fail(403, d.why, 'access');
    const at = nowIso(), trail = (Array.isArray(cs.trail) ? cs.trail : []).concat([{ at: at, by: s.email, name: s.name, act: act, why: why, total: Number(cs.total) || 0 }]);
    const u = await db('PATCH', 'pur_cs?no=eq.' + cs.no + '&version=eq.' + Number(cs.version) + '&status=eq.Sent', { status: act, trail: trail, decided_by: s.email, decided_name: s.name, decided_at: at, version: Number(cs.version) + 1 }, 'return=representation');
    if (!u || !u.length) throw fail(409, R.csNoOf(cs.no) + ' was decided by someone else just now – it is loaded again.', 'changed');
    if (act === 'Sent back') await unlock(r.no);      // (the maker corrects the quotations or the award and sends it again)
    else await db('PATCH', 'pur_rfq?no=eq.' + r.no, { status: 'Closed', status_note: act === 'Approved' ? 'CS ' + R.csNoOf(cs.no) + ' approved' : 'CS ' + R.csNoOf(cs.no) + ' rejected: ' + why, updated_by: s.email, updated_at: at }, 'return=minimal');
    await activity(r.site, s.email, act === 'Approved' ? 'CS approved' : act === 'Sent back' ? 'CS sent back' : 'CS rejected', R.csNoOf(cs.no), { total: Number(cs.total) || 0, need: cs.need, why: why });
    return Object.assign({ saved: true }, await A.csGet(s, { no: cs.no }));
  },
  // the CSs (x.mine: those waiting for HIS decision now; elsewhere: waiting for a Purchase Admin of another of his sites)
  async csList(s, x) {
    const st = ['Draft', 'Sent', 'Approved', 'Sent back', 'Rejected'].indexOf(x.status) > -1 ? '&status=eq.' + encodeURIComponent(x.status) : x.mine ? '&status=eq.Sent' : '';
    const rows = (await db('GET', 'pur_cs?select=no,rfq_no,site,status,total,gst,need,created_by,created_name,updated_by,sent_by,sent_name,sent_at,decided_name,decided_at,version' + st + '&order=no.desc&limit=300')) || [];
    const nos = [...new Set(rows.map(c => Number(c.rfq_no)))], rq = {};
    if (nos.length) ((await db('GET', 'pur_rfq?select=no,site,lines,status&no=in.(' + nos.join(',') + ')')) || []).forEach(r => { rq[r.no] = r; });
    const seen = rows.filter(c => rq[c.rfq_no] && mayAll(s, rfqSites(rq[c.rfq_no])));
    const out = c => { const r = rq[c.rfq_no], d = R.mayDecide(c, s); return { no: Number(c.no), ref: R.csNoOf(c.no), rfq_no: Number(c.rfq_no), rfq_ref: R.noOf(c.rfq_no), site: c.site, status: c.status, total: Number(c.total) || 0,
      gst: Number(c.gst) || 0, need: c.need, lines: (r.lines || []).length, items: (r.lines || []).slice(0, 3).map(l => l.name).join(', ') + ((r.lines || []).length > 3 ? ' …' : ''),
      created_name: c.created_name, sent_name: c.sent_name, sent_at: c.sent_at, decided_name: c.decided_name, decided_at: c.decided_at, version: Number(c.version), mayDecide: d.may, why: d.why }; };
    // (10-11-2026, Phase 2) an approved CS: its POs (not cancelled)
    const ap = seen.filter(c => c.status === 'Approved').map(c => Number(c.no)), pc = {};
    if (ap.length) (await poAll('&cs_no=in.(' + ap.join(',') + ')')).filter(p => p.status !== 'Cancelled').forEach(p => { (pc[p.cs_no] = pc[p.cs_no] || []).push(R.poNoOf(p.no)); });
    const out2 = c => Object.assign(out(c), { pos: (pc[Number(c.no)] || []).slice().sort() });
    if (!x.mine) return { list: seen.map(out2) };
    const list = seen.map(out2);
    return { list: list.filter(c => c.mayDecide), elsewhere: s.role === 'admin' ? list.filter(c => !c.mayDecide && c.need === 'admin' && c.site !== s.site && R.makersOf(seen.find(y => Number(y.no) === c.no)).indexOf(R.lower(s.email)) === -1) : [] };
  },

  /* ---------- (10-11-2026) PURCHASE PHASE 2 – PURCHASE ORDERS: one a supplier × site of an approved CS (P2); approved by the CS's
   * approval (G-6); the master here, its copy sent at once to the site's Store (D-2) – "Not yet at the site" when the Store does not
   * take it (Send again: the same copy, never twice); the site's GRNs and the balance read from the Store; cancelled (a Purchase Admin /
   * the Super Admin, why) only while no GRN is made at the site ---------- */
  // the form of a new PO: its lines and money from the CS, what it starts with (his quotation's payment terms; the site's shipping
  // address, contact and terms – as the site's Store has them for its papers)
  async poNew(s, x) {
    const { cs, r } = await csApproved(s, x.cs), vid = noOf(x.vendor), site = siteOf(s, x.site);
    const was = await poFor(cs.no, vid, site);
    if (was) throw fail(409, R.poNoOf(was.no) + ' is made already for this supplier and site' + (was.status === 'Cancelled' ? ' (Cancelled)' : '') + '.', 'made', { po: was.no });
    const m = rule(() => R.poMoney(cs.sheet, cs.award, vid, site, {}));
    const v = await vendorOf(vid);
    let pp = null, perr = '';
    try { pp = ((await link.po('papers', { sites: [site] })).sites || [])[0] || null; if (pp && pp.error) { perr = pp.error; pp = null; } } catch (e) { perr = e.message; }
    const need = [r.need_by].concat(m.lines.map(l => (r.lines.find(y => Number(y.line) === l.cs_line) || {}).need_by)).filter(Boolean).sort()[0] || null, t = R.today();
    return { cs: { no: cs.no, ref: R.csNoOf(cs.no), approved_name: cs.decided_name, approved_at: cs.decided_at }, rfq: { no: r.no, ref: R.noOf(r.no) }, site: site, site_name: (pp && pp.name) || site,
      vendor: vendorOut(v), money: m, start: { date: t, need_by: need && need >= t ? need : null, pay_terms: m.pay_terms || '', ship_to: pp ? pp.start.ship_to || '' : '', site_contact: pp ? pp.start.site_contact || '' : '', terms: pp ? pp.start.terms || '' : '' },
      papers_error: perr };
  },
  // a PO made (approved – G-6) and sent at once to the site's Store
  async poMake(s, x) {
    const { cs, r } = await csApproved(s, x.cs), vid = noOf(x.vendor), site = siteOf(s, x.site);
    if (await poFor(cs.no, vid, site)) throw fail(409, 'The PO for this supplier and site is made already – it is loaded.', 'changed');
    const head = rule(() => R.checkPoHead(x, { approved: R.dayIST(cs.decided_at) }));
    const m = rule(() => R.poMoney(cs.sheet, cs.award, vid, site, x.gst));
    if (m.missing.length) throw fail(400, 'Enter the GST % of ' + m.missing.map(n => 'line ' + n + ' (' + ((cs.sheet.lines || []).find(L => L.line === n) || {}).name + ')').join(', ') + ' – it is not in his quotation.', 'field', { missing: m.missing });
    const v = await vendorOf(vid);
    if (v.status === 'Blocked') throw fail(409, '"' + v.name + '" is Blocked (' + (v.status_note || 'a Purchase Admin blocked him') + ') – no PO is made to him. A Purchase Admin approves him again first (Suppliers).', 'blocked');
    const n = Number(await db('POST', 'rpc/pur_next_no', { p_kind: 'PO' }));
    if (!Number.isInteger(n) || n < 1) throw fail(500, 'No number could be given – try again.');
    const row = Object.assign({ no: n, rev: 1, site: site, cs_no: cs.no, rfq_no: r.no, vendor_id: vid, vendor: { name: v.name, gstin: v.gstin || '', pan: v.pan || '', address: v.address || '', phone: v.phone || '', email: v.email || '' },
      lines: m.lines, freight: m.freight, loading: m.loading, taxable: m.taxable, gst: m.gst, total: m.total, cs: { by: cs.decided_by || '', name: cs.decided_name || '', at: cs.decided_at || null },
      status: 'Open', created_by: s.email, created_name: s.name, updated_by: s.email }, head);
    try { await db('POST', 'pur_po', [row], 'return=minimal'); }
    catch (e) { if (e && e.code === 'duplicate') throw fail(409, 'The PO for this supplier and site was made by someone else just now – it is loaded.', 'changed'); throw e; }
    await activity(site, s.email, 'PO made', R.poNoOf(n), { cs: R.csNoOf(cs.no), vendor: v.name, site: site, lines: m.lines.length, total: m.total });
    const sent = await sendPo(s, poNorm(Object.assign({}, row, { sent_rev: null, send_tries: 0, ver: 1 })), false);
    return Object.assign({ saved: true, sent: sent.sent, send_error: sent.error }, await A.poGet(s, { no: n }));
  },
  // the POs of his sites – each with its state (the site's GRNs: partly received / received – read from the sites' Stores)
  async poList(s, x) {
    const rows = (await poAll('', 300)).filter(p => mayAll(s, [p.site])), st = await siteStates(rows.filter(p => p.status === 'Open' && p.sent_rev), false);
    const list = rows.map(p => { const c = st.of(p); return { no: p.no, ref: R.poNoOf(p.no), rev: p.rev, site: p.site, date: p.date, need_by: p.need_by, vendor: p.vendor.name || '', vendor_id: p.vendor_id,
      items: (p.lines || []).slice(0, 3).map(l => l.name).join(', ') + ((p.lines || []).length > 3 ? ' …' : ''), nlines: (p.lines || []).length, total: p.total, cs_no: p.cs_no, cs_ref: R.csNoOf(p.cs_no),
      status: p.status, state: R.poState(p, c), store_no: p.store_no, grns: c ? c.grn_count : null, send_error: p.send_error || '' }; });
    const want = String(x.state || '');
    return { pos: want ? list.filter(p => p.state === want) : list, store: st.error ? { ok: false, error: st.error } : { ok: true } };
  },
  // one PO in full: its lines and money, its state, the site's copy – every GRN made against it and the balance (from the site's Store)
  async poGet(s, x) {
    const p = await poOf(s, noOf(x.no)), st = await siteStates([p], true);      // (also a PO not yet at the site: the site's heading for its paper)
    const c = st.of(p), si = (st.sites || []).find(y => y.site === p.site) || {}, v = await vendorOf(p.vendor_id).catch(() => null);
    const state = R.poState(p, c), received = !!c && (c.grn_count > 0 || (c.lines || []).some(l => Number(l.came) > 0));
    return { po: Object.assign(poOut(p), { state: state, words: R.inWords(p.total), wa: R.waOf((p.vendor || {}).phone || (v && v.phone) || '') }),
      site: c ? { no: c.no, ref: c.ref, status: c.status, state: c.state, lines: c.lines, grns: c.grns || [], grn_count: c.grn_count } : null, site_error: st.error || '',
      heading: si.heading || null, site_name: si.name || p.site,
      may: { send: p.status === 'Open' && (!p.sent_rev || p.sent_rev < p.rev), cancel: p.status === 'Open' && isAdmin(s) && !received } };
  },
  // Send again – a PO not yet at the site (the same copy: never twice)
  async poSend(s, x) {
    const p = await poOf(s, noOf(x.no));
    if (p.status !== 'Open') throw fail(409, R.poNoOf(p.no) + ' is ' + p.status + ' – it is not sent.', 'state');
    if (p.sent_rev && p.sent_rev >= p.rev) throw fail(409, R.poNoOf(p.no) + ' is at the site already (its PO ' + p.store_no + ').', 'state');
    const sent = await sendPo(s, p, true);
    return Object.assign({ saved: sent.sent, sent: sent.sent, send_error: sent.error }, await A.poGet(s, { no: p.no }));
  },
  // cancelled (why) – a Purchase Admin or the Super Admin – only while no GRN is made against it at the site: the site's copy first
  async poCancel(s, x) {
    if (!isAdmin(s)) throw fail(403, 'Only a Purchase Admin or the Super Admin cancels a PO.', 'access');
    const p = await poOf(s, noOf(x.no));
    if (p.status !== 'Open') throw fail(409, R.poNoOf(p.no) + ' is ' + p.status + ' already.', 'state');
    const why = R.clean(x.why, 200); if (why.length < 3) throw fail(400, 'Write why it is cancelled.', 'field');
    if (Number(x.ver) !== p.ver) throw fail(409, CHANGED, 'changed');
    let r;
    try { r = await link.po('cancel', { site: p.site, po: R.poCopy(p, s), why: why }); }
    catch (e) {
      // the site's Store has no step 10 (or no Store at that site): no copy can be there – it is cancelled here
      if (e && (e.code === 'store_step10' || e.code === 'store_site')) r = { result: 'none', no: null };
      else if (e && e.code === 'store_received') throw fail(409, R.poNoOf(p.no) + ' is not cancelled – ' + String(e.message).replace(/^The Store: /, ''), 'received', e.extra || null);
      else if (e && /^store_/.test(String(e.code))) throw fail(409, R.poNoOf(p.no) + ' is not cancelled – ' + e.message, 'store');
      else if (e && e.code === 'link') throw e;
      else throw fail(503, 'The site\'s Store did not answer – nothing is cancelled (a GRN may be there): try again in a moment.', 'store');
    }
    const at = nowIso(), u = await db('PATCH', 'pur_po?no=eq.' + p.no + '&ver=eq.' + p.ver + '&status=eq.Open', { status: 'Cancelled', status_note: why, cancelled_by: s.email, cancelled_name: s.name, cancelled_at: at,
      store_no: p.store_no || (r && r.no) || null, updated_by: s.email, updated_at: at, ver: p.ver + 1 }, 'return=representation');
    if (!u || !u.length) throw fail(409, CHANGED, 'changed');
    await activity(p.site, s.email, 'PO cancelled', R.poNoOf(p.no), { why: why, site: p.site, at_site: r ? r.result : '', store_no: (r && r.no) || null });
    return Object.assign({ saved: true }, await A.poGet(s, { no: p.no }));
  },
};

/* ---------- (10-11-2026) the PO's helpers ---------- */
// an approved CS's POs: each supplier × site of its award – its PO (made) or "Make PO" (one of his sites); before step 3: step3 false
async function csPos(s, cs) {
  let pos = null;
  try { pos = ((await db('GET', 'pur_po?select=' + POSEL + '&cs_no=eq.' + Number(cs.no) + '&order=no.asc')) || []).map(poNorm); }
  catch (e) { if (!e || e.code !== 'notinstalled') throw e; }
  return { step3: pos !== null, groups: R.poGroups(cs.sheet || {}, cs.award || {}).map(g => {
    let m = null; try { m = R.poMoney(cs.sheet, cs.award, g.vendor, g.site, {}); } catch (e) { m = null; }
    const p = (pos || []).find(y => y.vendor_id === g.vendor && y.site === g.site);
    return { vendor: g.vendor, vendor_name: g.vendor_name, site: g.site, lines: g.lines.length, items: g.lines.slice(0, 3).map(L => L.name).join(', ') + (g.lines.length > 3 ? ' …' : ''),
      total: m ? m.total : 0, missing: m ? m.missing.length : 0, po: p ? { no: p.no, ref: R.poNoOf(p.no), status: p.status, state: R.poState(p, null), total: p.total } : null, may: pos !== null && !p && mayAll(s, [g.site]) }; }) };
}
const STEP3 = 'Purchase\'s database step 3 is not run yet: the Super Admin runs sql/pur_step3_po.sql once in the rcl-purchase Supabase → SQL Editor. Until then no PO is made – the rest works as before.';
// an approved CS (and its enquiry, of his sites) – POs come only from one
async function csApproved(s, no) {
  const cs = ((await db('GET', 'pur_cs?select=*&no=eq.' + noOf(no))) || [])[0];
  if (!cs) throw gone(R.csNoOf(noOf(no)));
  cs.no = Number(cs.no);
  const r = await rfqOf(s, Number(cs.rfq_no));
  if (cs.status !== 'Approved') throw fail(409, R.csNoOf(cs.no) + ' is ' + cs.status + ' – POs are made only from an approved CS.', 'state');
  return { cs: cs, r: r };
}
// the site of a PO – one of his sites (the Super Admin: any)
function siteOf(s, v) {
  const site = String(v || '').toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(site)) throw fail(400, 'Which site?', 'field');
  if (!mayAll(s, [site])) throw fail(403, 'Site ' + site + ': you have no Purchase there.', 'access');
  return site;
}
const poFor = async (cs, vid, site) => { const p = ((await db('GET', 'pur_po?select=no,status&cs_no=eq.' + Number(cs) + '&vendor_id=eq.' + Number(vid) + '&site=eq.' + encodeURIComponent(site))) || [])[0]; return p ? { no: Number(p.no), status: p.status } : null; };
async function vendorOf(id) { const v = ((await db('GET', 'pur_vendors?select=' + VCOLS + '&id=eq.' + Number(id))) || [])[0]; if (!v) throw gone('This supplier'); return v; }
async function poOf(s, no) {
  const p = ((await db('GET', 'pur_po?select=' + POSEL + '&no=eq.' + no)) || [])[0];
  if (!p) throw gone(R.poNoOf(no));
  if (!mayAll(s, [p.site])) throw fail(403, R.poNoOf(no) + ' is of site ' + p.site + ' – you have no Purchase there.', 'access');
  return poNorm(p);
}
const poOut = p => ({ no: p.no, ref: R.poNoOf(p.no), rev: p.rev, site: p.site, cs_no: p.cs_no, cs_ref: R.csNoOf(p.cs_no), rfq_no: p.rfq_no, rfq_ref: R.noOf(p.rfq_no), vendor_id: p.vendor_id, vendor: p.vendor || {},
  date: p.date, need_by: p.need_by, lines: p.lines || [], freight: p.freight, loading: p.loading, taxable: p.taxable, gst: p.gst, total: p.total, pay_terms: p.pay_terms || '', ship_to: p.ship_to || '',
  site_contact: p.site_contact || '', terms: p.terms || '', remark: p.remark || '', approved: p.cs || {}, status: p.status, status_note: p.status_note || '', cancelled_name: p.cancelled_name || '', cancelled_at: p.cancelled_at,
  sent: { rev: p.sent_rev, at: p.sent_at, store_no: p.store_no, error: p.send_error || '', tries: p.send_tries, last: p.send_at }, created_name: p.created_name, created_at: p.created_at, ver: p.ver });
/* the copy sent to the site's Store: taken (made / the same one again) – "At the site"; not – "Not yet at the site" with why (Send
 * again). Each try written in pur_activity. → { sent, error } */
async function sendPo(s, p, again) {
  let r = null, error = '';
  try { r = await link.po('put', { site: p.site, po: R.poCopy(p, s) }); }
  catch (e) { error = String((e && e.message) || e).slice(0, 400); }
  const at = nowIso(), ok = !!r && (r.result === 'made' || r.result === 'same');
  if (r && !ok) error = r.result === 'cancelled' ? 'At the site this PO is Cancelled (its PO ' + r.no + ') – cancel it here too.' : r.result === 'older' ? 'The site has a later revision of it (' + r.rev + ').' : 'The Store did not take it (' + String(r.result) + ').';
  const set = ok ? { sent_rev: p.rev, store_no: r.no, sent_at: at, send_error: '', send_tries: p.send_tries + 1, send_at: at } : { send_error: error, send_tries: p.send_tries + 1, send_at: at };
  try { await db('PATCH', 'pur_po?no=eq.' + p.no, set, 'return=minimal'); }
  catch (e) { error = error || 'Sent to the site, but not noted here (' + String((e && e.message) || e).slice(0, 120) + ') – press Send again (the same copy).'; return { sent: false, error: error }; }
  await activity(p.site, s.email, ok ? (again ? 'PO sent again' : 'PO sent to the site') : 'PO not yet at the site', R.poNoOf(p.no), ok ? { site: p.site, store_no: r.no, result: r.result, ref: r.ref } : { site: p.site, error: error });
  return { sent: ok, error: ok ? '' : error };
}
/* the copies as the sites' Stores have them (one signed question): { of(po) → the copy or null, error, sites } */
async function siteStates(rows, full) {
  const by = {}; rows.forEach(p => { (by[p.site] = by[p.site] || []).push(p.no); });
  const q = Object.keys(by).sort().map(k => ({ site: k, nos: by[k] }));
  if (!q.length) return { of: () => null, error: '', sites: [] };
  let j;
  try { j = await link.po('state', { q: q, full: !!full }); }
  catch (e) { return { of: () => null, error: 'The sites\' Stores could not be read now (' + String((e && e.message) || e).slice(0, 160) + ') – the GRNs and the balance are not shown.', sites: [] }; }
  const m = {}, errs = []; (j.sites || []).forEach(st => { if (st.error) errs.push(st.site + ': ' + st.error); (st.pos || []).forEach(c => { m[st.site + ':' + c.pur_no] = c; }); });
  return { of: p => m[p.site + ':' + p.no] || null, error: errs.join(' · '), sites: j.sites || [] };
}

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });
  sameSite(req);
  const s = await ses.need(req), x = await readBody(req), a = String(x.action || '');
  if (!Object.prototype.hasOwnProperty.call(A, a)) return send(res, 404, { error: 'Unknown action.', code: 'action' });
  try { send(res, 200, Object.assign({ ok: true }, await A[a](s, x || {}))); }
  catch (e) { if (e && e.code === 'notinstalled') throw /^po[A-Z]/.test(a) ? fail(500, STEP3, 'step3') : fail(500, STEP2, 'step2'); throw e; }
});
module.exports.A = A;      // (for the unit test)
module.exports.csView = csView;
