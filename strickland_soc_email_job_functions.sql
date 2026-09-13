-- ============================================================
-- Strickland SOC — automatic shift email job functions
-- Run this in Supabase → SQL Editor, in the same project as the
-- dar_shift_reports table (previous migration).
--
-- WHY THIS EXISTS: the daily email job runs as a scheduled Claude
-- task, not a signed-in operator, so it has no Supabase Auth
-- session and normal row-level security (which checks
-- user_id = auth.uid()) would block it from seeing anything. Rather
-- than hand that job your Supabase service_role key (which would
-- give it -- and anyone who ever saw that key -- unrestricted read
-- and write access to EVERY table in this project), these two
-- functions are the only door the job gets: they run with elevated
-- privilege internally (`security definer`) but only do the one
-- narrow thing each is named for, and only when called with the
-- job secret below. The anon key stays the public, low-stakes key
-- it already is; this secret is what actually gates access.
--
-- JOB_SECRET used below: 8Kt2xL3dufVLrfVem5JoHKscIgRQ7eIUIn59x5qto9A
-- Treat it like a password -- it's baked into the scheduled task
-- that calls these functions. If it's ever exposed, generate a new
-- random string, replace it in both function bodies below, re-run
-- this file, and tell Claude so the scheduled task's prompt can be
-- updated to match (mcp__claude-code-remote__update_trigger).
--
-- Safe to re-run: every step is idempotent (create or replace).
-- ============================================================

create or replace function get_due_shift_reports(p_job_secret text)
returns setof dar_shift_reports
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_job_secret is distinct from '8Kt2xL3dufVLrfVem5JoHKscIgRQ7eIUIn59x5qto9A' then
    raise exception 'unauthorized';
  end if;
  return query
    select * from dar_shift_reports
    where shift_date = ((now() at time zone 'America/New_York')::date - 1)
      and emailed_at is null;
end;
$$;

create or replace function mark_shift_report_status(p_job_secret text, p_user_id uuid, p_shift_date date, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_job_secret is distinct from '8Kt2xL3dufVLrfVem5JoHKscIgRQ7eIUIn59x5qto9A' then
    raise exception 'unauthorized';
  end if;
  update dar_shift_reports
  set emailed_at = now(), email_status = p_status
  where user_id = p_user_id and shift_date = p_shift_date;
end;
$$;

-- Lock both functions down to exactly this: callable via the public
-- anon key (same key your dashboard already uses client-side -- it
-- is not a secret on its own), but only ever DOES anything if the
-- caller also supplies the correct job secret above.
revoke all on function get_due_shift_reports(text) from public;
revoke all on function mark_shift_report_status(text, uuid, date, text) from public;
grant execute on function get_due_shift_reports(text) to anon;
grant execute on function mark_shift_report_status(text, uuid, date, text) to anon;

-- ============================================================
-- Sanity check -- call this the same way the daily job will, via
-- Supabase's RPC endpoint. Returns no rows until a shift has been
-- ended for "yesterday" (America/New_York) and not yet emailed.
-- ============================================================
select * from get_due_shift_reports('8Kt2xL3dufVLrfVem5JoHKscIgRQ7eIUIn59x5qto9A');
