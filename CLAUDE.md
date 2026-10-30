# CLAUDE.md – RCL ERP Purchase module

Read this first, then `README.md`. The same owner and rules as the Mechanical module (`rclerp/CLAUDE.md`), the Portal, the
Store and Engineering; the short version:

## The owner and how to talk to him
* Sujit Mule, MD of Rachana Construction Limited (RCL).
* **Reply in Marathi (Devanagari).** Answer first. Simple. One step at a time.
* "adhi charcha kar" = discuss first, no code. "fkt check kr" = only check, change nothing.

## Rules
1. **Exactly what he asks, nothing extra.** He decides each step.
2. **Simple screens**, clear at a glance.
3. **Live and business-critical:** never delete, reset or overwrite live data; no destructive SQL; no push to `main` / deploy
   without his yes; a database change is justified and approved separately and he runs the SQL himself (in the Purchase
   Supabase); existing features and permissions keep working.
4. **Evidence, not claims:** read the code, run the tests, say plainly what was not run or not verified.
5. **Every shell / test / network command has a `timeout`.** A hang: run the one test alone, find the case, fix it. Never just re-run.
6. **Fix a thing everywhere it is used** – also in the phone app (`rcl-mobile`): whatever is added here gets its app screen in
   the same piece of work.
7. **No secret, key, password or personal data in any file.** Keys live only in Vercel → Environment Variables and are never
   pasted in chat.
8. Work arrives as a branch + pull request; he merges; Vercel deploys.

## Decisions that shape this repository (30-10-2026; full list: `rclerp/architecture/RCL_ERP_Decisions.md`, the plan: the
## Project doc `architecture/RCL_ERP_Store_Purchase_Audit_Plan.md`)
* **One Supabase project for Purchase for EVERY site** (`rcl-purchase`): every row carries its site; a site of today and every
  new site are in it by themselves. This server reads and writes only the sites of the person's sign-in.
* **One address:** `https://oneclicksolution-erp.vercel.app/purchase` (Mechanical's `vercel.json` sends `/purchase/…` here),
  inside Mechanical's screen (`?embed=1`), like the Store and Engineering.
* **The Portal** is the one sign-in and the one place access is given (Purchase Admin / User per site; the Super Admin is the
  Portal's). Purchase trusts a Portal ticket only after checking its ES256 signature with `/api/jwks`, its `aud` ("purchase"),
  `exp`, and that its `jti` is used once.
* **A site's stock, GRN and issue stay in that site's own database** (the Store). Purchase writes into a site's Store only
  through the Store's own server (Option C of the plan).
* **Still to be decided before the purchase work (Phase 2):** where the purchase order is kept; the open decisions of Part 9 of
  the plan.
