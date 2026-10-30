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

## What is in it now (the foundation)
| Who | Pages |
|---|---|
| **Everyone with Purchase** | **Dashboard** – the Purchase Department and the sites where he has Purchase (the site open now marked). |

The purchase work itself (requirements from the sites, enquiries, comparison, approval, purchase orders …) comes page by page as
he decides it – the plan: the Project doc `architecture/RCL_ERP_Store_Purchase_Audit_Plan.md`. A site's stock, GRN and issue
stay in that site's own database (the Store); Purchase writes into a site's Store only through the Store's own server.

## Parts
| Part | File |
|---|---|
| The page (dark menu, Dashboard) | `public/index.html` |
| Sign-in with the Portal's ticket / who is signed in / sign out | `api/sso.js`, `api/me.js`, `api/logout.js` |
| The menu for the screen around it (`/menu.json` → `api/menu.js`, per person) | `api/menu.js` |
| Database, ticket check, sign-ins, activity record, Preview guard | `lib/db.js`, `lib/portal.js`, `lib/session.js`, `lib/activity.js`, `lib/preview.js` |
| Database (run once in the Purchase Supabase) | `sql/pur_step1_base.sql` |

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

In the Portal (Super Admin): **Modules** → key `purchase`, name `Purchase`, address `https://oneclicksolution-erp.vercel.app/purchase`;
then **Users & Access** → Purchase Admin / Purchase User per site.

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
```
Purchase on the rig: `PORT=3050 SUPABASE_URL=http://127.0.0.1:3110 SUPABASE_SECRET_KEY=<the rig's> PORTAL_URL=http://127.0.0.1:3010 node dev.js`.
