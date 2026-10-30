'use strict';
const { db } = require('./db');
// who did what in Purchase (never stops the work it records)
async function activity(site, email, action, target, detail) {
  try { await db('POST', 'pur_activity', [{ site: site, email: email || '', action: action, target: String(target || '').slice(0, 200), detail: detail || null }], 'return=minimal'); }
  catch (e) { console.error('[purchase activity] ' + String((e && e.message) || e)); }
}
module.exports = { activity };
