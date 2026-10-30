/* (with Mechanical's update-195, asked 30-10-2026 – "ya modual la google sheet asign kruya"; his choice: Purchase's own Sheet)
 * Purchase's data for the backup – only for Mechanical's backup, asked with BACKUP_EXPORT_SECRET (lib/bkexport.js – the same file
 * as in rcl-portal and rcl-engineering). Purchase is one department for EVERY site: its rows of every site go into Purchase's own
 * numbered Google Sheets ("Purchase – …" tabs; the Super Admin gives them in the Portal → Sites → Purchase backup), each row with
 * its site. Only the columns listed here leave (a column added later never leaves by itself); the sign-ins (pur_sessions) and the
 * used tickets (pur_tickets) are never given. */
'use strict';
const { handler, readBody, send, fail } = require('../lib/http');
const { allowed, make } = require('../lib/bkexport');
const TABLES = {
  pur_people: { title: 'People', key: 'site,email', since: 'last_seen', cols: ['site', 'email', 'name', 'role', 'first_seen', 'last_seen'] },
  pur_settings: { title: 'Settings', key: 'site,id', since: 'updated_at', cols: ['site', 'id', 'value', 'updated_by', 'updated_at'] },
  pur_numbers: { title: 'Numbers', key: 'kind', cols: ['kind', 'next_no'] },
  pur_activity: { title: 'Activity', key: 'id', since: 'at', cols: ['id', 'at', 'site', 'email', 'action', 'target', 'detail'] },
};
const run = make(TABLES, {});      // (every site – not one site's rows: the Purchase Department's own Sheet)
module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });
  allowed(req);
  const c = { url: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), key: String(process.env.SUPABASE_SECRET_KEY || '') };
  if (!c.url || !c.key) throw fail(500, 'The Purchase server is not set up: SUPABASE_URL and SUPABASE_SECRET_KEY are missing in Vercel.');
  const x = await readBody(req);
  if (x && x.action === 'usage') throw fail(400, 'Not given here (Purchase\'s database size is not in the Storage panel yet).');
  send(res, 200, await run(c, x));
});
module.exports.TABLES = TABLES;
