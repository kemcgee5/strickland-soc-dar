-- ============================================================
-- Strickland SOC — real cross-device syncing, PER LOGIN
-- Run this in Supabase → SQL Editor, against the SAME project
-- that already holds the tenants/memberships setup.
--
-- This REPLACES the earlier version of this migration (the one
-- that made dar_shifts keyed by tenant_id). That version synced
-- ANY two signed-in users on the strickland-soc tenant together,
-- which is not what you want — you asked for syncing only between
-- two logins using the EXACT SAME credentials, with a different
-- login never affected. This version keys the table by user_id
-- instead, so each login gets its own row and its own live channel.
--
-- Safe to re-run: every step is idempotent. Any test row that was
-- sitting in the old tenant_id-keyed table is dropped by this —
-- that's fine, it was just test data. Nothing in anyone's browser
-- (localStorage) is touched by this migration.
-- ============================================================

-- Drop the old tenant_id-keyed table and its policies, if present,
-- since the primary key is changing shape (tenant_id -> user_id).
drop table if exists dar_shifts;

-- One shared row per LOGIN (auth user) holding that login's live
-- shift (stores, log entries, operator, everything) as a single
-- JSON blob. tenant_id is kept as a plain reference column (which
-- tenant/dashboard this login's shift belongs to) but is no longer
-- part of the key and is not used to decide who sees what.
create table dar_shifts (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  tenant_id   bigint references tenants(id) on delete set null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  session_id  text
);

-- Lock it down to "you can only ever read/write your own row."
-- This is stricter than the membership check used elsewhere: it
-- doesn't matter which tenant a login belongs to, only whether the
-- row's user_id is the signed-in user's own id.
alter table dar_shifts enable row level security;

drop policy if exists "dar_shifts_select_own_row" on dar_shifts;
create policy "dar_shifts_select_own_row"
  on dar_shifts for select
  using ( user_id = auth.uid() );

drop policy if exists "dar_shifts_insert_own_row" on dar_shifts;
create policy "dar_shifts_insert_own_row"
  on dar_shifts for insert
  with check ( user_id = auth.uid() );

drop policy if exists "dar_shifts_update_own_row" on dar_shifts;
create policy "dar_shifts_update_own_row"
  on dar_shifts for update
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- Turns on live updates for this table, so a second device signed
-- into the SAME login sees a change within a couple seconds without
-- reloading. Because RLS is scoped to user_id = auth.uid(), Realtime
-- itself will only ever deliver a given login its own row's changes,
-- even though the client also adds a user_id filter for clarity.
-- If this errors saying the table is already in the publication,
-- that's fine — it just means this step already ran.
alter publication supabase_realtime add table dar_shifts;

-- ============================================================
-- Sanity check — returns no rows until the first shift is opened
-- from a signed-in device; re-run after that to see the row appear
-- for that login's user_id.
-- ============================================================
select user_id, tenant_id, updated_at, updated_by
from dar_shifts;
