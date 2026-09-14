/**
 * One-off design-preview test send. Completely separate from the real
 * daily job: uses a bundled sample shift (not real Supabase data), never
 * checks the time, never touches dar_shift_reports, never marks anything
 * as sent. Safe to hit as many times as you want while checking how the
 * email looks -- it never affects the automatic morning send.
 *
 * Visit in a browser:
 *   https://<your-domain>.vercel.app/api/send-test-email?secret=<CRON_SECRET>
 */
const { renderShiftPdf } = require("../lib/renderPdf");
const { buildBrandedEmailHtml } = require("../lib/emailTemplate");
const { getGraphToken, sendMailWithAttachment } = require("../lib/graphMailer");

const SAMPLE_SHIFT = {
  S: {
    kind: "soc",
    client: "Cracker Barrel — SOC",
    date: "2026-09-14",
    start: "22:00",
    end: "06:00",
    guard: "",
    stores: [
      {
        id: "s1", num: "387", mode: "work",
        mgr: "Store Manager", co: "ABC HVAC Co.", contact: "Tom Fixit", cell: "555-201-3344",
        crew: "2", ete: "22:15", exit: "01:40", calledOut: "yes", cleaningCrew: "no",
        alarmAt: "", alarmZone: "", alarmType: "", cams: "", dispatch: "", dispatchWho: "",
        resolution: "", esc: false, escNote: "", closed: false, closedAt: "", closedBy: "",
        log: [
          { id: "e10", at: "2026-09-14T22:04", type: "Contractor check-in call", note: "Contractor arrived, working on HVAC unit", by: "Jane Operator" },
          { id: "e11", at: "2026-09-15T01:40", type: "Contractor check-out call", note: "Job complete, contractor departed", by: "Jane Operator" }
        ]
      },
      {
        id: "s2", num: "451", mode: "alarm",
        mgr: "", co: "", contact: "", cell: "", crew: "", ete: "", exit: "",
        calledOut: "", cleaningCrew: "", alarmAt: "2026-09-15T02:15", alarmZone: "Rear door",
        alarmType: "Door contact", cams: "Reviewed, no activity seen", dispatch: "no", dispatchWho: "",
        resolution: "False alarm, door not fully latched — reset by SOC", esc: false, escNote: "",
        closed: false, closedAt: "", closedBy: "",
        log: [
          { id: "e12", at: "2026-09-15T02:15", type: "Alarm activation", note: "Rear door contact alarm — reviewed cameras, no activity seen, false alarm", by: "Jane Operator" }
        ]
      }
    ],
    std: { client: "", site: "", addr: "", cityst: "", post: "", log: [], summary: "", incidents: "", equipment: "", passdown: "", esc: false, escNote: "" },
    shiftEvents: [
      { id: "e1", at: "2026-09-14T22:00", note: "Jane Operator started shift — signed on", guard: "Jane Operator", kind: "start" },
      { id: "e20", at: "2026-09-15T06:00", note: "Jane Operator ended shift — handed off", guard: "Jane Operator", kind: "end" }
    ]
  },
  seq: 21
};

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers["authorization"] || "";
    const qsSecret = (req.query && req.query.secret) || "";
    const ok = authHeader === `Bearer ${process.env.CRON_SECRET}` || qsSecret === process.env.CRON_SECRET;
    if (!ok) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
  }

  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, SENDER_EMAIL, RECIPIENT_EMAIL } = process.env;
  const missing = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "SENDER_EMAIL", "RECIPIENT_EMAIL"]
    .filter(k => !process.env[k]);
  if (missing.length) {
    res.status(500).json({ ok: false, error: "missing env vars: " + missing.join(", ") });
    return;
  }

  try {
    const token = await getGraphToken(AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET);
    const pdfBuffer = await renderShiftPdf(SAMPLE_SHIFT);
    const generatedAt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date()) + " ET (design preview — sample data)";
    const htmlBody = buildBrandedEmailHtml(SAMPLE_SHIFT, generatedAt, true);

    await sendMailWithAttachment(
      token, SENDER_EMAIL, RECIPIENT_EMAIL,
      "TEST — Strickland SOC Daily Activity Report (design preview)",
      htmlBody,
      pdfBuffer,
      "Strickland_SOC_Sample_Report.pdf"
    );
    res.status(200).json({ ok: true, sent: true, to: RECIPIENT_EMAIL });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
};
