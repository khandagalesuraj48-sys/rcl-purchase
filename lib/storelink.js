/* THE INBOX FROM THE STORE (09-11-2026, Purchase Phase 1). A site's requirements, their approval, stock, GRN and issue stay in that
 * site's own database (the Store – Option C of the plan): Purchase only ASKS the Store's own server for the approved requirement lines
 * still to order (the same figures as the Store's HO purchase list), for the sites the person has Purchase on.
 *   POST <the Store>/api/purinbox { v: 1, ts, nonce, sites, sig }      (rcl-store api/purinbox.js answers only this)
 *   sig = HMAC-SHA256 with PUR_STORE_SECRET of "rcl-pur-store|v1|<ts>|<nonce>|<sites joined by ,>" – the SAME secret in the Store's and
 *   Purchase's Vercel projects, never in a file; ts = now (the Store refuses one more than 5 minutes off); nonce = 32 hex, used once.
 * Where the Store is: STORE_URL (Vercel, an address – not a secret); not set: the one address, <PUBLIC_URL's origin>/store. */
'use strict';
const crypto = require('crypto');
const { fail } = require('./http');

const secret = () => String(process.env.PUR_STORE_SECRET || '').trim();      // (a newline pasted with the value in Vercel is not part of it)
const okUrl = u => { u = String(u || '').trim().replace(/\/+$/, ''); return /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[a-z0-9-]{1,30})?$/i.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[a-z0-9-]{1,30})?$/i.test(u) ? u : ''; };
function storeUrl() {
  const own = okUrl(process.env.STORE_URL); if (own) return own;
  try { const p = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL) : null; return p && p.protocol === 'https:' ? okUrl(p.origin + '/store') : ''; } catch (e) { return ''; }
}
const linked = () => secret().length >= 24 && !!storeUrl();
const textOf = (ts, nonce, sites) => ['rcl-pur-store', 'v1', ts, nonce, sites.join(',')].join('|');
const sign = (key, ts, nonce, sites) => crypto.createHmac('sha256', key).update(textOf(ts, nonce, sites)).digest('hex');
const NOT_SET = 'The link to the Store is not set up: PUR_STORE_SECRET (the same long secret word in the Store\'s and Purchase\'s Vercel projects) – the Super Admin sets it, then Redeploy both.';

/* the approved requirement lines still to order of these sites → { sites: [{ site, name, reqs, own?, error? }], today } */
async function pending(sites) {
  const key = secret(), base = storeUrl();
  if (key.length < 24 || !base) throw fail(503, NOT_SET, 'link');
  const list = [...new Set((sites || []).map(s => String(s).toUpperCase()).filter(s => /^[A-Z0-9]{1,12}$/.test(s)))].sort().slice(0, 40);
  if (!list.length) return { sites: [], today: '' };
  const ts = Date.now(), nonce = crypto.randomBytes(16).toString('hex');
  let r, j = null;
  try {
    r = await fetch(base + '/api/purinbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 1, ts: ts, nonce: nonce, sites: list, sig: sign(key, ts, nonce, list) }), signal: AbortSignal.timeout(25000) });
    j = await r.json();
  } catch (e) { throw fail(503, 'The Store did not answer – try again in a moment.', 'store'); }
  if (r.status === 503 && j && j.code === 'setup') throw fail(503, NOT_SET + ' (the Store has no PUR_STORE_SECRET)', 'link');
  if (r.status === 401) throw fail(503, 'The Store refused Purchase\'s question (' + String((j && j.error) || 'refused') + ') – PUR_STORE_SECRET must be the same in both Vercel projects (and the clocks right).', 'link');
  if (!r.ok || !j || !Array.isArray(j.sites)) throw fail(503, 'The Store could not answer now (' + String((j && j.error) || r.status).slice(0, 160) + ') – try again in a moment.', 'store');
  return j;
}
module.exports = { pending, linked, sign, textOf, storeUrl, NOT_SET };
