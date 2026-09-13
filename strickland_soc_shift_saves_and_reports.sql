-- ============================================================
-- Strickland SOC — "resume later" saved shifts, and a per-shift
-- archive for the upcoming automatic email.
-- Run this in Supabase → SQL Editor, in the SAME project as the
-- dar_shifts (live sync) table from the previous migration.
-- Safe to re-run: every step is idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- dar_shift_saves: "resume later." Every time someone clicks
-- "Save current shift" (or "Save shift for later first" from the
-- Reset dialog), one new row is added here with a full snapshot of
-- that shift. Unlike dar_shifts (the single live row that keeps
-- changing), these are point-in-time copies you can list, resume,
-- or delete -- scoped to the signed-in login, same as live sync.
-- ------------------------------------------------------------
create table if not exists dar_shift_saves (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   bigint references tenants(id) on delete set null,
  label       text not null,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

alter table dar_shift_saves enable row level security;

drop policy if exists "dar_shift_saves_select_own" on dar_shift_saves;
create policy "dar_shift_saves_select_own"
  on dar_shift_saves for select
  using ( user_id = auth.uid() );

drop policy if exists "dar_shift_saves_insert_own" on dar_shift_saves;
create policy "dar_shift_saves_insert_own"
  on dar_shift_saves for insert
  with check ( user_id = auth.uid() );

drop policy if exists "dar_shift_saves_delete_own" on dar_shift_saves;
create policy "dar_shift_saves_delete_own"
  on dar_shift_saves for delete
  using ( user_id = auth.uid() );

create index if not exists dar_shift_saves_user_created_idx
  on dar_shift_saves (user_id, created_at desc);

-- ------------------------------------------------------------
-- dar_shift_reports: one row per (login, shift date), written
-- automatically every time "End Shift" is pressed (never something
-- the operator sees or manages directly). If a second operator ends
-- the same overnight shift later, the row is overwritten with the
-- more complete version. This is what the automatic-email job will
-- read from at 8am the next morning -- it needs a stable copy of a
-- finished shift, independent of whatever the live shift looks like
-- by then (which may already be a brand new night).
-- ------------------------------------------------------------
create table if not exists dar_shift_reports (
  user_id       uuid not null references auth.users(id) on delete cascade,
  shift_date    date not null,
  tenant_id     bigint references tenants(id) on delete set null,
  data          jsonb not null,
  updated_at    timestamptz not null default now(),
  emailed_at    timestamptz,
  email_status  text,
  primary key (user_id, shift_date)
);

alter table dar_shift_reports enable row level security;

drop policy if exists "dar_shift_reports_select_own" on dar_shift_reports;
create policy "dar_shift_reports_select_own"
  on dar_shift_reports for select
  using ( user_id = auth.uid() );

drop policy if exists "dar_shift_reports_upsert_own" on dar_shift_reports;
create policy "dar_shift_reports_upsert_own"
  on dar_shift_reports for insert
  with check ( user_id = auth.uid() );

drop policy if exists "dar_shift_reports_update_own" on dar_shift_reports;
create policy "dar_shift_reports_update_own"
  on dar_shift_reports for update
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

-- Note: the automatic-email job that will read this table on its
-- 8am schedule runs as a backend process, not as a signed-in
-- operator -- it will need its own access path (a service-role key
-- or a dedicated Postgres function), which is part of the still-
-- pending decision on how that job is hosted. Nothing here blocks
-- that; these policies only govern what a signed-in browser can do.

-- ============================================================
-- Sanity checks -- both return no rows until first used.
-- ============================================================
select id, label, created_at from dar_shift_saves order by created_at desc limit 20;
select user_id, shift_date, updated_at, emailed_at, email_status from dar_shift_reports order by shift_date desc limit 20;
