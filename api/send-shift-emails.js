/**
 * Vercel Cron target: checks whether it's ~8am America/New_York right
 * now and, if so, emails yesterday's completed Strickland SOC shift
 * report(s) (branded HTML body + real PDF attached) via Microsoft Graph.
 *
 * WHY A TIME CHECK INSTEAD OF A PRECISE CRON SCHEDULE: Vercel Cron
 * schedules are evaluated in UTC, and a fixed UTC offset for "8am
 * Eastern" is only correct until the next Daylight Saving transition.
 * Instead, this function is invoked every 15 minutes (see vercel.json)
 * and does nothing at all unless the CURRENT real America/New_York hour
 * is 8 -- which Node's Intl/timeZone handling gets right automatically,
 * DST included, with no special-case date math.
 *
 * WHY IT'S SAFE TO FIRE 4 TIMES BETWEEN 8:00-8:59: get_due_shift_reports
 * only returns rows where emailed_at is still null, and every successful
 * send immediately calls mark_shift_report_status(..., 'sent') which
 * sets emailed_at. So a second invocation in the same hour simply finds
 * nothing left to do.
 */
const { getDueShiftReports, markShiftReportStatus, shiftIsComplete } = require("../lib/supabaseRpc");
const { renderShiftPdf } = require("../lib/renderPdf");
const { buildBrandedEmailHtml } = require("../lib/emailTemplate");
const { getGraphToken, sendMailWithAttachment } = require("../lib/graphMailer");

function currentEasternHour() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(fmt.format(new Date()), 10);
}

module.exports = async (req, res) => {
  // Vercel automatically sends this header on Cron-triggered invocations
  // when CRON_SECRET is set -- rejects any other caller.
  if (process.env.CRON_SECRET) {
    const auth = req.headers["authorization"] || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  const hour = currentEasternHour();
  if (hour !== 8) {
    res.status(200).json({ ok: true, ranJob: false, reason: `not yet 8am ET (currently ${hour}:xx ET)` });
    return;
  }

  const {
    SUPABASE_URL, SUPABASE_ANON_KEY, JOB_SECRET,
    AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
    SENDER_EMAIL, RECIPIENT_EMAIL,
  } = process.env;

  const missing = ["SUPABASE_URL","SUPABASE_ANON_KEY","JOB_SECRET","AZURE_TENANT_ID","AZURE_CLIENT_ID","AZURE_CLIENT_SECRET","SENDER_EMAIL","RECIPIENT_EMAIL"]
    .filter(k => !process.env[k]);
  if (missing.length) {
    res.status(500).json({ ok: false, error: "missing env vars: " + missing.join(", ") });
    return;
  }

  const results = [];
  try {
    const dueRows = await getDueShiftReports(SUPABASE_URL, SUPABASE_ANON_KEY, JOB_SECRET);

    if (!dueRows.length) {
      res.status(200).json({ ok: true, ranJob: true, due: 0, results: [] });
      return;
    }

    // Acquire one Graph token up front and reuse it for every row this run.
    const token = await getGraphToken(AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET);

    for (const row of dueRows) {
      const key = `${row.user_id}/${row.shift_date}`;
      if (!shiftIsComplete(row)) {
        await markShiftReportStatus(SUPABASE_URL, SUPABASE_ANON_KEY, JOB_SECRET, row.user_id, row.shift_date, "skipped_incomplete");
        results.push({ key, status: "skipped_incomplete" });
        continue;
      }
      try {
        const pdfBuffer = await renderShiftPdf(row.data);
        const generatedAt = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }).format(new Date()) + " ET";
        const htmlBody = buildBrandedEmailHtml(row.data, generatedAt, false);
        const clientName = (row.data && row.data.S && row.data.S.client) || "Strickland SOC";
        await sendMailWithAttachment(
          token, SENDER_EMAIL, RECIPIENT_EMAIL,
          `Strickland SOC Daily Activity Report — ${clientName} — ${row.shift_date}`,
          htmlBody,
          pdfBuffer,
          `Strickland_SOC_Shift_Report_${row.shift_date}.pdf`
        );
        await markShiftReportStatus(SUPABASE_URL, SUPABASE_ANON_KEY, JOB_SECRET, row.user_id, row.shift_date, "sent");
        results.push({ key, status: "sent" });
      } catch (err) {
        await markShiftReportStatus(SUPABASE_URL, SUPABASE_ANON_KEY, JOB_SECRET, row.user_id, row.shift_date, "error: " + String(err.message || err).slice(0, 200));
        results.push({ key, status: "error", error: String(err.message || err) });
      }
    }

    res.status(200).json({ ok: true, ranJob: true, due: dueRows.length, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err), results });
  }
};
