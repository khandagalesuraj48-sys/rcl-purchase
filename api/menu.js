/* GET /menu.json (→ /api/menu) – the pages of Purchase for the menu of the screen around it (Mechanical's dark menu): only the
 * pages this person has. Before the first sign-in here nobody is known: every page is listed – the page itself then opens only
 * what he has. (30-10-2026: the Purchase Department is set up – its first page is its Dashboard; the purchase work comes page by
 * page as the Super Admin decides it.) */
'use strict';
const { handler, send } = require('../lib/http');
const ses = require('../lib/session');
const PAGES = [
  { key: 'dashboard', name: 'Dashboard', who: 'all' },
];
const mayOpen = (who, role) => who === 'all' || (who === 'admin' && (role === 'admin' || role === 'super')) || (who === 'super' && role === 'super');
module.exports = handler(async (req, res) => {
  let s = null; try { s = await ses.read(req); } catch (e) { s = null; }
  send(res, 200, { module: 'purchase', name: 'Purchase', pages: PAGES.filter(p => !s || mayOpen(p.who, s.role)).map(p => ({ key: p.key, name: p.name })) });
});
module.exports.PAGES = PAGES;
module.exports.mayOpen = mayOpen;
