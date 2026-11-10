# RCL ERP – Purchase

The Purchase Department of RCL ERP (set up 30-10-2026). His words: "supabase ani vercel madhe purchase department banau sagle
site cha data tyatach asel mg old site aso ki new banel tewa pn ani aata jas aahe ekach link warti sagle kahi".

* **One Purchase for every site** – its own Supabase project (`rcl-purchase`) and its own Vercel project. Every row carries its
  site, so the sites of today and every new site are in it by themselves: nothing to set up here for a new site.
* **Sign-in only through the Portal.** The Portal sends the person here with a one-minute signed ticket (role: Super Admin,
  Purchase Admin or Purchase User of that site; with the list of every site where he has Purchase). Nobody signs in here.
* **One address:** it opens at `https://oneclicksolution-erp.vercel.app/purchase`, inside Mechanical's screen like the Store and
  Engineering (Mechanical's `vercel.json` sends `/purchase/…` here – a separate change in Mechanical).
* **A sign-in lasts 15 minutes:** the open page asks the Portal for a fresh ticket every 10 minutes and signs in again by itself.
  Whom the Super Admin removes in the Portal is out within 15 minutes.
* **Change site** at the top of the dark menu goes to another of his sites with Purchase through the Portal.

## What is in it now (the foundation + Phase 1)
| Who | Pages |
|---|---|
| **Everyone with Purchase** | **Dashboard** – the Purchase Department and the sites where he has Purchase (the site open now marked). |
| **Everyone with Purchase** (Phase 1) | **Inbox**, **Enquiries**, **Quotations**, **Comparative Statement**, **Suppliers** |
| **Everyone with Purchase** (Phase 2) | **Purchase Orders** (made from an approved CS; **Cancel PO**: a Purchase Admin / the Super Admin) |
| **Purchase Admin, Super Admin** | **Waiting for my approval** |
| **Super Admin** | **Settings** – the CS limit (₹) |

The rest comes page by page as he decides it – the plan: the Project doc
`architecture/RCL_ERP_Store_Purchase_Audit_Plan.md`. A site's stock, GRN and issue stay in that site's own database (the Store);
Purchase reads a site's Store and (later) writes into it only through the Store's own server.

## Purchase Phase 1 – enquiry, quotations, comparative statement, approval (09-11-2026; database step 2)
His decisions of 09-11-2026:
* **P1 – approval by amount.** A CS up to the limit the Super Admin sets (Settings, ₹, for every site) is approved by a **Purchase
  Admin of its site**; above it – or while no limit is set – by the **Super Admin**. Who made it, last changed it or sent it never
  approves it (not even the Super Admin). **Send back** (why) → the maker corrects the quotations / the award and sends it again;
  **Reject** (why) ends it. A decision is on the version he saw: two at the same moment – the first counts, the other is told.
* **P2 – at least 2 quotations an item**; fewer only with a typed reason (kept on the CS). The award is **item-wise**: each line to
  its own supplier, so one CS can lead to several suppliers.
* **P3 – the comparison WITHOUT GST** (the GST input credit is taken): landed rate a unit = rate × (1 − discount %) + the supplier's
  freight + loading spread over the lines he quoted by their value; GST % and GST ₹ (on the goods after the discount, as on the
  company's PO) beside. **L1** = the lowest landed rate of a line (to the paisa – equal ones are all L1); a line given to one who is
  not L1 needs a reason.

The pages (`public/pur.js`):
* **Inbox** – the approved Material Requirement lines of his sites still to order, the Store's own figures (the same as the Store's
  HO Purchase list); the Indent No., brand / specification, need-by, waiting since, made by. Tick lines → **Make enquiry**. A line in
  an open enquiry (or awarded – its CS approved) shows it ("RFQ-0001 · Sent", "Awarded") and is not ticked again. A site that buys its
  requirements itself (Portal → Workflow) says so.
* **Enquiries (RFQ)** – RFQ-0001 … (never given twice): date, need-by, remark, its lines (each with its site, requirement and line;
  never more than is left; a line asked once), the suppliers asked (Approved ones). Draft → **Mark as sent** → Quotes in → Closed (its
  CS approved / rejected) or Cancelled (why; its maker, a Purchase Admin or the Super Admin). **Print** (one page a supplier) and
  **Share on WhatsApp** (a wa.me link with the enquiry as its text – the person taps it; no e-mail). Changed while its CS is not sent.
* **Quotations** – each supplier's, as he gave it: a line's rate, Disc. %, GST %, delivery days (a line not quoted – its rate empty);
  freight, loading, payment terms, valid till, remark. The page works out the net rate, the amounts and the total without GST. Every
  change keeps the version before it. Locked once its CS is sent (open again when it is sent back).
* **Comparative Statement** – worked out from the quotations (again while Draft / Sent back): side by side, the landed rate of each
  supplier on each line, **L1** marked, each line **Given to** a supplier (first its L1), **Why (not L1)**, "Fewer than 2 quotations –
  why", the total without GST, GST beside, who approves it. **Send for approval** only when every line is given and every reason is
  there. The decisions kept (who, when, why). Print.
* **Waiting for my approval** – the CSs he may decide now (a CS waiting for a Purchase Admin of another of his sites: named – open
  Purchase on that site).
* **Suppliers** – Purchase's own list, one for every site: name, GST no., PAN (from the GST no. when empty), mobile, e-mail, address,
  what he supplies; the same checks as Mechanical's Vendor Master; the same name or GST no. never twice. **Block** (why) / **Approve**
  again: a Purchase Admin or the Super Admin (a Blocked one is not asked in a new enquiry).
* Every action is checked on the server (`api/pur.js`, the rules in `lib/rules.js`); a person sees and works only on what is of his
  sites (an enquiry's own site and the sites of its lines); every save writes `pur_activity`.
* **Not yet:** the supplier's own quotation document (the column `pur_quote.doc` is kept for its reference – the upload comes later);
  the new tables are not in Purchase's backup Sheet yet; the phone app's screens (rcl-mobile).

**The Inbox from the Store** (`lib/storelink.js` → the Store's `api/purinbox.js`): Purchase's server asks the Store's server for the
sites of the person's sign-in; the question is signed (HMAC-SHA256 with `PUR_STORE_SECRET`, its time – at most 5 minutes off – and a
nonce used once). Not set: the Inbox says so; nothing is asked.

## Purchase Phase 2 – the purchase order (10-11-2026; database step 3; the Store's step 10)
His decisions (binding): **D-2** (confirmed again 09-11-2026) – the PO's **master copy is kept here** (the Purchase Supabase, every site in
one); the **site keeps a copy** in its own Store, written ONLY through the Store's own server (a signed call – the same `PUR_STORE_SECRET`
as the Inbox; a nonce used once; the time window); an older revision never overwrites a newer one. **G-6** – no extra PO approval after
the CS's final approval: a PO of an approved CS reaches the site **already approved** (the Store's own PO approval / verification do not
stop it). **P2** – item-wise award: **one PO a supplier × site** of an approved CS (one CS can give several POs).
* **Comparative Statement** – an approved CS shows **Purchase orders of CS-…**: each supplier × site of its award, its PO (and its state) or
  **Make PO** (a Purchase User / Admin of that site, or the Super Admin). The form starts with: today, delivery by (the enquiry's need-by),
  his quotation's payment terms, the site's **shipping address, site contact and terms as the site's Store has them for its own PO**; the
  lines as in the CS – qty, rate, Disc. %, GST % (a GST % he did not quote is typed here), the CS's landed rate; freight and loading of his
  quotation as the CS spreads them (the part of his quoted lines' value these lines are). The money as the company's PO (the Store's):
  amount = qty × rate less Disc. %, GST on it; total = the lines + freight + loading. Not before the CS's approval, not after today; a
  supplier Blocked since: no PO. **PO-0001 …** never given twice (`pur_next_no('PO')`).
* **At once to the site**: the copy is written in the site's Store (`store_po`, "From Purchase – PO-0001", approved, Open, each line with its
  requirement and line – the site's GRNs and bills are made against it as any PO; what is still to order falls by itself, here and in the
  Store's HO list). The Store does not take it (it does not answer; its step 10 not run; a rule – e.g. more than asked): the PO stays here as
  **Not yet at the site** with why – **Send again** (the same copy: sent twice it is one copy).
* **Purchase Orders** – the list (state: Not yet at the site / At the site / Partly received / Received / Cancelled); a PO in full: its lines
  with what **came at the site** and the **balance**, every **GRN** made against it there (each bill checked with the PO) – read from the
  site's Store (signed); **Print** – the company's PO paper (the Store's look: the logo, the site's company heading, Supplier Details, PO
  Details, Shipping Address, the lines, the totals in figures and words, Terms, Prepared By / Approved By – the CS's approver); **Share on
  WhatsApp** (a wa.me link with the PO as its text – the person taps it; no e-mail); **Cancel PO** (a Purchase Admin / the Super Admin, why)
  only while no GRN is made at the site – the site's copy Cancelled first (one at a time with the site's GRN saves); its lines free again in
  the Inbox. After a GRN: refused, the GRNs named.
* **Inbox**: a line of an award shows "Awarded" until its PO is made, then the PO ("PO-0001", "· Not yet at the site"); a cancelled PO frees it.
* **The site**: its Store shows the copy "From Purchase – PO-0001" – read-only (its Store Admin, HO Purchase of the Store, its PO
  approver: no Change / Cancel / Delete / Close / Approve – refused by the Store's server too).
* **Not now** (later, as he decides): a PO's amendment / revision by Purchase (the columns are there: `rev`, `history`, the copy's
  `pur_rev` – the Store refuses a later revision until it is built), delivery follow-up, QC, 3-way match, e-mail; the phone app's screens.

## Database step 3 (once, in the rcl-purchase Supabase → SQL Editor, after step 2)
`sql/pur_step3_po.sql` – it only adds; it can be run again safely. Result: `Purchase step 3 done · tables 1 of 1`. Table `pur_po` (the PO:
its number and revision, CS and enquiry, site, supplier as on the day, lines, money, payment terms, address, terms, Open / Cancelled, the
site's copy – the revision there, its number there, the last send and why it did not get there). For the server only (row level
security on). Until it is run: no PO is made (the CS says so); the rest as before. With it, **every site's Supabase needs the Store's step
10** (`rcl-store sql/store_step10_purchase_po.sql`) – until then a PO of that site stays "Not yet at the site" (Send again after it).

## Database step 2 (once, in the rcl-purchase Supabase → SQL Editor, after step 1)
`sql/pur_step2_rfq_cs.sql` – it only adds; it can be run again safely. Result: `Purchase step 2 done · tables 4 of 4`.
Tables: `pur_vendors`, `pur_rfq`, `pur_quote`, `pur_cs` (each row with its site) and the function `pur_next_no(kind)` (RFQ / CS
numbers, never given twice – kept in step 1's `pur_numbers`). Every table for the server only (row level security on). Until it is
run the new pages say so; the Dashboard works as before. Rollback (only while nothing is entered): in the step's header.

## Parts
| Part | File |
|---|---|
| The page (dark menu, Dashboard) | `public/index.html` |
| Phase 1: the pages / every action and its check / the rules / the Inbox from the Store | `public/pur.js`, `api/pur.js`, `lib/rules.js`, `lib/storelink.js` |
| Phase 2: the purchase order – its page, actions (`poNew`, `poMake`, `poList`, `poGet`, `poSend`, `poCancel`), rules, the signed calls to the Store (`po`), the logo of its paper | `public/pur.js`, `api/pur.js`, `lib/rules.js`, `lib/storelink.js`, `public/img/rcl-logo.png` |
| Sign-in with the Portal's ticket / who is signed in / sign out | `api/sso.js`, `api/me.js`, `api/logout.js` |
| The menu for the screen around it (`/menu.json` → `api/menu.js`, per person) | `api/menu.js` |
| Database, ticket check, sign-ins, activity record, Preview guard | `lib/db.js`, `lib/portal.js`, `lib/session.js`, `lib/activity.js`, `lib/preview.js` |
| The backup export (only for Mechanical's backup, with the secret) | `api/backup-export.js`, `lib/bkexport.js` |
| Database (run once in the Purchase Supabase, in this order) | `sql/pur_step1_base.sql`, `sql/pur_step2_rfq_cs.sql`, `sql/pur_step3_po.sql` |

## Database step 1 (once, in the rcl-purchase Supabase → SQL Editor)
`sql/pur_step1_base.sql` – it only adds; it can be run again safely. Result: `Purchase step 1 done · tables 6 of 6`.
Tables: `pur_people` (the people of Purchase, site by site), `pur_settings`, `pur_numbers`, `pur_sessions` (a fingerprint
only), `pur_tickets`, `pur_activity`. Every table is for the server only (row level security on, nothing for anon / authenticated).
It touches no other database.

## Settings (Vercel → the Purchase project → Settings → Environment Variables – never in a file)
| Name | What |
|---|---|
| `SUPABASE_URL` | the Purchase project's address: `https://kcrityxnwfcpnusegyvf.supabase.co` |
| `SUPABASE_SECRET_KEY` | the Purchase project's secret key (Supabase → Project Settings → API Keys) |
| `PORTAL_URL` | the same value as in the Store and Engineering projects |
| `PUBLIC_URL` | `https://oneclicksolution-erp.vercel.app/purchase` |
| `BACKUP_EXPORT_SECRET` | (with Mechanical's update-195) the SAME long secret word as in rclerp, rcl-portal and rcl-engineering. Mechanical's nightly backup asks `/api/backup-export` with it for Purchase's rows (into Purchase's own backup Sheet). Not set = nothing is given. |
| `PUR_STORE_SECRET` | (Phase 1, 09-11-2026) a long secret word (24 letters or more), the SAME in the Store's Vercel project. Purchase signs its question for the Inbox with it – and (Phase 2) every PO call to a site's Store. Not set = the Inbox says the link is not set up; a PO stays "Not yet at the site". |
| `STORE_URL` | only if the Store is not at the one address: the Store's address. Not set = `<origin of PUBLIC_URL>/store` (`https://oneclicksolution-erp.vercel.app/store`). An address, not a secret. |

In the Portal (Super Admin): **Modules** → key `purchase`, name `Purchase`, address `https://oneclicksolution-erp.vercel.app/purchase`;
then **Users & Access** → Purchase Admin / Purchase User per site.

## Backup into Purchase's own Google Sheet (30-10-2026, with Mechanical's update-195)
Asked: "ya modual la google sheet asign kruya"; his choice: Purchase's own Sheet (every site's Purchase data in one Sheet, like the
Portal's backup; full → Sheet 2). The Super Admin gives its link in the Portal → Sites → **Purchase backup** (Change link / Add
Sheet N / Backup now). Every night Mechanical copies the tabs "Purchase – People / Settings / Numbers / Activity" (each row with its
site) through `api/backup-export.js` (`lib/bkexport.js` – the same file as the Portal's and Engineering's), asked with
`BACKUP_EXPORT_SECRET`. Only the listed columns leave; the sign-ins and used tickets never. No database step.


## The BETA copy (02-11-2026 – the testers' copy on the live data; Mechanical's `BETA_SETUP.md`)
* The branch `beta` deployed as a Preview **with `RCL_CHANNEL = beta`** set in Vercel for that branch only (`lib/preview.js`
  `isBeta()` – both must hold): the guard above is skipped – it works on the **live** database the branch's settings name.
  Any other Preview: refused on a database without the test mark, as before.
* `/api/me` and `/api/sso` say `beta: true`; the page shows a purple band "BETA – the new version for testers · the data is LIVE".
* Its address: `https://rclerp-git-beta-pk12356843.vercel.app/purchase` (Mechanical's `vercel.json`); the Portal sends a tester there
  (Portal → Modules → Beta link). It runs no timed job (Vercel runs those only on the live one).

## A Preview = the staging (TEST) copy (as every module)
On a Vercel **Preview**, `lib/preview.js` asks the database first: it must have the row `app_settings.THIS_IS_A_TEST_DATABASE = 'yes'`.
The live Purchase database has no `app_settings` table, so a Preview pointing at it is refused with 503 – nothing read or written;
the page shows an orange TEST band. Live (`production`) asks nothing.

## Tests (local test rig only – never the live databases)
```
timeout 120 node --test test/unit.test.js     # no database
timeout 300 node test/api.test.js             # rig (PORTAL=1 bash rig/all.sh): Portal :3010, Purchase :3050, database :3110
timeout 300 node test/browser.test.js         # rig + Chromium, after api.test.js; pictures in test/shots/
timeout 300 node test/inmech.test.js          # rig in one-address mode (GATEWAY=1 PORTAL=1 bash rig/all.sh), after api.test.js
timeout 400 node test/rfqcs.test.js           # (Phase 1) rig, step 2 run in rcl_pur: the whole story – limit, suppliers, Inbox, RFQ, quotations, CS, approval
timeout 400 node test/rfqcs.browser.test.js   # (Phase 1) rig + Chromium, after api.test.js: the pages; pictures in test/shots/
timeout 500 node test/po.test.js              # (Phase 2) rig, step 3 here and the Store's step 10 in S1 / T2: the whole story of the POs
timeout 500 node test/po.browser.test.js      # (Phase 2) rig + Chromium: Make PO, its view, paper, WhatsApp, the Store's page, a phone; test/shots/po_*.png
```
Purchase on the rig: `PORT=3050 SUPABASE_URL=http://127.0.0.1:3110 SUPABASE_SECRET_KEY=<the rig's> PORTAL_URL=http://127.0.0.1:3010 node dev.js`.
For Phase 1 the rig's Purchase and Store are started with the same made-up `PUR_STORE_SECRET` (and Purchase with
`STORE_URL=http://127.0.0.1:3020`) in their start command only; `rfqcs.test.js` given the same value also calls the Store's door
directly (wrong secret, old time, a nonce used twice – refused). Phase 2: `po.test.js` given the same value calls the Store's PO door
directly too (an older revision, other figures, a wrong secret / an old time / a nonce twice / the Inbox's signature – refused) and stops /
starts the rig's Store once ("the Store does not answer"; `STOREDOWN=0` leaves that out).
