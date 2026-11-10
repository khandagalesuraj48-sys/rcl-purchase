-- =====================================================================
-- RCL ERP – PURCHASE, step 3: the purchase order (PO) – Purchase Phase 2 (10-11-2026). The owner's decisions:
--   D-2 (confirmed again 09-11-2026) the PO's MASTER copy is kept here, in Purchase (one database for every site); the SITE keeps a copy
--       in its own Store, written ONLY through the Store's own server (a signed call – the same PUR_STORE_SECRET as the Inbox; a nonce
--       used once); an older revision never overwrites a newer one.
--   G-6 no extra PO approval after the comparative statement's final approval: a PO made from an approved CS is approved (the Store's
--       own PO approval and verification do not stop it).
--   P2  the award is item-wise: ONE PO A SUPPLIER × SITE of an approved CS (one CS can give several POs); each line keeps its site's
--       requirement and line – the site's GRNs and bills use the copy as any PO (each GRN lowers its balance), and what is still to order
--       of a requirement falls by itself.
-- Written fresh for RCL – no code of any other project.
-- Run ONCE in the Purchase Supabase project (rcl-purchase), AFTER pur_step1_base.sql and pur_step2_rfq_cs.sql.
-- Supabase → SQL Editor → New query → paste → Run. It can be run again safely: it only ADDS one table (and its indexes); nothing is
-- changed or deleted. The PO numbers come from step 2's pur_next_no('PO') (kept in step 1's pur_numbers – never given twice). It
-- touches no other database (the sites' Store copies come with the Store's own step 10 – sql/store_step10_purchase_po.sql of rcl-store).
-- Before it is run, Purchase works exactly as before (the Purchase Orders page says this step is needed).
--
--   pur_po   a purchase order: its number (never given twice) and revision (1 – a later amendment gets the next: the copy at the
--            site never takes an older one), its comparative statement (and who approved it, when – its "Approved By", G-6) and
--            enquiry, its site (where the material goes) and supplier
--            (as he was on the day: name, GST no., PAN, address, mobile, e-mail), date, delivery by, its lines (each with its site's
--            requirement and line, item, qty, rate, Disc. %, GST %, amount, GST, total, and the CS's landed rate), freight and loading
--            (his quotation's, as the CS spreads them), the totals, payment terms, the site's shipping address and contact, terms,
--            remark; Open / Cancelled (why, who, when); the site's copy: the revision it has, its number there, when it got there,
--            the last time it was sent and why it did not get there ("Not yet at the site" – Send again); every earlier version
--            (history – for the amendment later); who / when; a version (two saves at the same moment never both count)
-- Every table is for the server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while no PO is made): drop table public.pur_po; delete from public.pur_numbers where kind = 'PO';
-- =====================================================================
create table if not exists public.pur_po (
  no bigint primary key,
  rev integer not null default 1 check (rev >= 1),
  site text not null,
  cs_no bigint not null references public.pur_cs (no), rfq_no bigint not null references public.pur_rfq (no),
  vendor_id bigint not null references public.pur_vendors (id), vendor jsonb not null default '{}',
  date date not null, need_by date,
  lines jsonb not null default '[]',
  freight numeric not null default 0 check (freight >= 0), loading numeric not null default 0 check (loading >= 0),
  taxable numeric not null default 0, gst numeric not null default 0, total numeric not null default 0,
  pay_terms text not null default '', ship_to text not null default '', site_contact text not null default '', terms text not null default '',
  remark text not null default '',
  cs jsonb not null default '{}',
  status text not null default 'Open' check (status in ('Open', 'Cancelled')), status_note text not null default '',
  cancelled_by text not null default '', cancelled_name text not null default '', cancelled_at timestamptz,
  sent_rev integer, store_no bigint, sent_at timestamptz,
  send_error text not null default '', send_tries integer not null default 0, send_at timestamptz,
  history jsonb not null default '[]',
  created_by text not null default '', created_name text not null default '', created_at timestamptz not null default now(),
  updated_by text not null default '', updated_at timestamptz not null default now(),
  ver integer not null default 1,
  unique (cs_no, vendor_id, site),
  check (need_by is null or need_by >= date)
);
create index if not exists pur_po_site on public.pur_po (site, no desc);
create index if not exists pur_po_cs on public.pur_po (cs_no);
create index if not exists pur_po_status on public.pur_po (status);

alter table public.pur_po enable row level security;
revoke all on public.pur_po from public, anon, authenticated;
grant select, insert, update, delete on public.pur_po to service_role;

notify pgrst, 'reload schema';
select 'Purchase step 3 done · tables ' || (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('pur_po')) || ' of 1' as done;
