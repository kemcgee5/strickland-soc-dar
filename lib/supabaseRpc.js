/**
 * Thin wrapper around the two job-secret-gated Postgres RPC functions
 * (strickland_soc_email_job_functions.sql). Called over Supabase's
 * PostgREST RPC endpoint using the public anon key -- the anon key alone
 * can't do anything with these; the job secret is the real gate.
 */

async function getDueShiftReports(supabaseUrl, anonKey, jobSecret) {
  const url = supabaseUrl.replace(/\/+$/, "") + "/rest/v1/rpc/get_due_shift_reports";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_job_secret: jobSecret }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`get_due_shift_reports failed (${resp.status}): ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function markShiftReportStatus(supabaseUrl, anonKey, jobSecret, userId, shiftDate, status) {
  const url = supabaseUrl.replace(/\/+$/, "") + "/rest/v1/rpc/mark_shift_report_status";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_job_secret: jobSecret,
      p_user_id: userId,
      p_shift_date: shiftDate,
      p_status: status,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`mark_shift_report_status failed (${resp.status}): ${text.slice(0, 500)}`);
  }
  return true;
}

/** A due row is eligible only if it has BOTH a start and an end
 * shiftEvent -- per requirement: no email if a shift wasn't both
 * started and ended. */
function shiftIsComplete(row) {
  try {
    const events = (row.data && row.data.S && row.data.S.shiftEvents) || [];
    const hasStart = events.some(e => e.kind === "start");
    const hasEnd = events.some(e => e.kind === "end");
    return hasStart && hasEnd;
  } catch (e) {
    return false;
  }
}

module.exports = { getDueShiftReports, markShiftReportStatus, shiftIsComplete };
