-- =====================================================================
-- RCL ERP – PURCHASE, step 2: suppliers, enquiries (RFQ), quotations and the comparative statement (CS) – Purchase Phase 1
-- (09-11-2026). The owner's decisions of 09-11-2026:
--   P1 a CS is approved BY AMOUNT: up to the limit the Super Admin sets (Purchase → Settings) a Purchase Admin, above it the Super
--      Admin; the maker and the last editor never approve their own CS; Sent back (with why) → corrected and sent again; Rejected
--      (with why) ends it.
--   P2 at least 2 quotations an item (fewer only with a typed reason, kept on the CS); the award is item-wise (each line its vendor).
--   P3 the comparison WITHOUT GST: landed rate = rate less discount + freight and loading spread over the vendor's quoted lines by
--      value; GST % and GST beside; L1 (the lowest landed rate) marked on each line; a line given to a vendor who is not L1 needs a
--      reason.
-- Written fresh for RCL – no code of any other project.
-- Run ONCE in the Purchase Supabase project (rcl-purchase – one project for EVERY site), AFTER pur_step1_base.sql.
-- Supabase → SQL Editor → New query → paste → Run. It can be run again safely: it only ADDS; nothing is changed or deleted. It
-- touches no other database (the sites' databases, the Store, the Portal, Mechanical and Engineering are not changed by it).
-- Before it is run, Purchase works exactly as before (its new pages say this step is needed).
--
--   pur_vendors   Purchase's own supplier list – one for every site (site '*'): name, GST no., PAN, address, phone, e-mail, what
--                 they supply, Approved / Blocked, who / when
--   pur_rfq       an enquiry (RFQ): its number (never given twice), date, need-by, its lines (each with its site, requirement no. and
--                 line, item, unit, quantity), the suppliers asked, Draft / Sent / Quotes in / Closed / Cancelled, who / when
--   pur_quote     one supplier's quotation for one enquiry: each line's rate, discount %, GST %, delivery days; freight, loading,
--                 payment terms, valid till, remark; the supplier's own document (a reference only – kept for later); every
--                 earlier version (history); locked once its CS is sent
--   pur_cs        the comparative statement of an enquiry: the comparison as worked out, the award of each line, the reasons, the
--                 total without GST, Draft / Sent / Approved / Sent back / Rejected, who must approve (admin / super), every
--                 decision (trail), a version (two decisions at the same moment never both count)
--   pur_next_no() the next number of a kind (RFQ, CS) in one step (two people at the same moment never get the same number)
-- Every table is for the server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while nothing is entered): drop function public.pur_next_no(text);
--   drop table public.pur_cs, public.pur_quote, public.pur_rfq, public.pur_vendors;
-- =====================================================================
create table if not exists public.pur_vendors (
  id bigserial primary key, site text not null default '*',
  name text not null, name_key text not null,
  gstin text not null default '', pan text not null default '', address text not null default '', phone text not null default '',
  email text not null default '', supplies jsonb not null default '[]',
  status text not null default 'Approved' check (status in ('Approved', 'Blocked')), status_note text not null default '',
  created_by text not null default '', created_name text not null default '', created_at timestamptz not null default now(),
  updated_by text not null default '', updated_at timestamptz not null default now(),
  ver integer not null default 1
);
create unique index if not exists pur_vendors_name on public.pur_vendors (site, name_key);
create unique index if not exists pur_vendors_gstin on public.pur_vendors (site, gstin) where gstin <> '';

create table if not exists public.pur_rfq (
  no bigint primary key, site text not null,
  date date not null, need_by date,
  lines jsonb not null default '[]',
  vendors jsonb not null default '[]',
  remark text not null default '',
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Quotes in', 'Closed', 'Cancelled')),
  status_note text not null default '',
  sent_by text not null default '', sent_at timestamptz,
  created_by text not null default '', created_name text not null default '', created_at timestamptz not null default now(),
  updated_by text not null default '', updated_at timestamptz not null default now(),
  ver integer not null default 1,
  check (need_by is null or need_by >= date)
);
create index if not exists pur_rfq_site on public.pur_rfq (site, no desc);
create index if not exists pur_rfq_status on public.pur_rfq (status);

create table if not exists public.pur_quote (
  id bigserial primary key,
  rfq_no bigint not null references public.pur_rfq (no), vendor_id bigint not null references public.pur_vendors (id),
  site text not null, vendor_name text not null default '',
  lines jsonb not null default '[]',
  freight numeric not null default 0 check (freight >= 0), loading numeric not null default 0 check (loading >= 0),
  pay_terms text not null default '', valid_till date, remark text not null default '',
  doc jsonb,
  history jsonb not null default '[]',
  locked boolean not null default false,
  created_by text not null default '', created_name text not null default '', created_at timestamptz not null default now(),
  updated_by text not null default '', updated_name text not null default '', updated_at timestamptz not null default now(),
  ver integer not null default 1,
  unique (rfq_no, vendor_id)
);

create table if not exists public.pur_cs (
  no bigint primary key,
  rfq_no bigint not null unique references public.pur_rfq (no),
  site text not null,
  sheet jsonb not null default '{}',
  award jsonb not null default '{}',
  few_reason text not null default '',
  total numeric not null default 0, gst numeric not null default 0,
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Approved', 'Sent back', 'Rejected')),
  need text not null default '' check (need in ('', 'admin', 'super')),
  cs_limit numeric,
  trail jsonb not null default '[]',
  created_by text not null default '', created_name text not null default '', created_at timestamptz not null default now(),
  updated_by text not null default '', updated_name text not null default '', updated_at timestamptz not null default now(),
  sent_by text not null default '', sent_name text not null default '', sent_at timestamptz,
  decided_by text not null default '', decided_name text not null default '', decided_at timestamptz,
  version integer not null default 1
);
create index if not exists pur_cs_status on public.pur_cs (status);

create or replace function public.pur_next_no(p_kind text) returns bigint
language sql security definer set search_path = public as $$
  insert into public.pur_numbers (kind, next_no) values (p_kind, 2)
  on conflict (kind) do update set next_no = public.pur_numbers.next_no + 1
  returning next_no - 1;
$$;
revoke all on function public.pur_next_no(text) from public, anon, authenticated;
grant execute on function public.pur_next_no(text) to service_role;

do $$ declare t text; begin
  foreach t in array array['pur_vendors', 'pur_rfq', 'pur_quote', 'pur_cs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
revoke all on sequence public.pur_vendors_id_seq, public.pur_quote_id_seq from public, anon, authenticated;
grant usage, select on sequence public.pur_vendors_id_seq, public.pur_quote_id_seq to service_role;

notify pgrst, 'reload schema';
select 'Purchase step 2 done · tables ' || (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('pur_vendors', 'pur_rfq', 'pur_quote', 'pur_cs')) || ' of 4' as done;
