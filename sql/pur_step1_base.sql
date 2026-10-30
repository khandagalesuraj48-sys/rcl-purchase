-- =====================================================================
-- RCL ERP – PURCHASE, step 1: the Purchase Department's own database (30-10-2026, his words: "supabase ani vercel madhe purchase
-- department banau sagle site cha data tyatach asel mg old site aso ki new banel tewa pn ani aata jas aahe ekach link warti sagle kahi").
-- Run ONCE in the Purchase Supabase project (rcl-purchase – one project for EVERY site; every row carries its site, so a site of
-- today and every new site are in it by themselves). Supabase → SQL Editor → New query → paste → Run.
-- It can be run again safely: it only ADDS; nothing is changed or deleted. It touches no other database (the sites' databases,
-- the Portal, Mechanical, the Store and Engineering are not changed by it).
--
--   pur_people    the people of Purchase on a site (who signed in, with the role the Portal gave: Admin / User / Super Admin)
--   pur_settings  the Purchase Department's settings, site by site ('*' = for every site)
--   pur_numbers   the numbers of its papers, never given twice (each kind, e.g. 'RFQ', 'CS')
--   pur_sessions, pur_tickets, pur_activity – the sign-ins (a fingerprint only), the Portal tickets used, who did what
-- Every table is for the server only: row level security on, nothing for anon / authenticated.
-- Rollback (only while nothing is entered): drop table public.pur_activity, public.pur_tickets, public.pur_sessions,
--   public.pur_numbers, public.pur_settings, public.pur_people;
-- =====================================================================
create table if not exists public.pur_people (
  site text not null, email text not null, name text not null default '',
  role text not null default 'user' check (role in ('super', 'admin', 'user')),
  first_seen timestamptz not null default now(), last_seen timestamptz not null default now(),
  primary key (site, email)
);
create table if not exists public.pur_settings (
  site text not null default '*', id text not null, value jsonb, updated_by text not null default '', updated_at timestamptz not null default now(),
  primary key (site, id)
);
create table if not exists public.pur_numbers (
  kind text primary key, next_no bigint not null default 1 check (next_no >= 1)
);
create table if not exists public.pur_sessions (
  id_hash text primary key, site text not null, email text not null, name text not null default '',
  role text not null check (role in ('super', 'admin', 'user')), info jsonb not null default '{}',
  created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index if not exists pur_sessions_email on public.pur_sessions (email);
create table if not exists public.pur_tickets (jti text primary key, expires_at timestamptz not null);
create table if not exists public.pur_activity (
  id bigserial primary key, at timestamptz not null default now(), site text not null, email text not null default '',
  action text not null, target text not null default '', detail jsonb
);
create index if not exists pur_activity_at on public.pur_activity (site, at desc);

do $$ declare t text; begin
  foreach t in array array['pur_people', 'pur_settings', 'pur_numbers', 'pur_sessions', 'pur_tickets', 'pur_activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
revoke all on sequence public.pur_activity_id_seq from public, anon, authenticated;
grant usage, select on sequence public.pur_activity_id_seq to service_role;

notify pgrst, 'reload schema';
select 'Purchase step 1 done · tables ' || (select count(*) from information_schema.tables where table_schema = 'public'
  and table_name in ('pur_people', 'pur_settings', 'pur_numbers', 'pur_sessions', 'pur_tickets', 'pur_activity')) || ' of 6' as done;
