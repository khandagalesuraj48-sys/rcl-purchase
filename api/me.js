/* GET /api/me – who is signed in here (and the Portal's address, also when nobody is: the page then goes there). */
'use strict';
const { handler, send } = require('../lib/http');
const portal = require('../lib/portal');
const ses = require('../lib/session');
const { isPreview } = require('../lib/preview');
module.exports = handler(async (req, res) => {
  const s = await ses.read(req);
  if (!s) return send(res, 200, { signedIn: false, portal: portal.url(), preview: isPreview() || undefined });
  send(res, 200, { signedIn: true, preview: isPreview() || undefined, user: { email: s.email, name: s.name, role: s.role }, site: s.site, siteName: s.info.siteName || s.site, mods: s.info.mods || [], sites: s.info.sites || [], portal: portal.url() });
});
