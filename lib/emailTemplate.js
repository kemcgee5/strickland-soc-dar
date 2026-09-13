/**
 * Builds the branded HTML email body for a Strickland SOC shift report
 * email. Kept as a light SUMMARY (client/shift/operator + entry counts +
 * a few highlights) -- the full consolidated log is in the attached PDF,
 * which is rendered from the dashboard's own real layout. Unlike the
 * Outlook connector (confirmed to strip all style=/bgcolor attributes on
 * send and to support no attachments at all), Microsoft Graph's sendMail
 * does not sanitize HTML, so this safely uses full inline CSS.
 */

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(iso) {
  if (!iso) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return iso;
  return `${months[mi]} ${parseInt(d, 10)}, ${y}`;
}

function collectSummary(data) {
  const S = (data && data.S) || {};
  const std = S.std || {};
  const isStd = (S.kind === "std") || (!!(std.site || std.client) && !(S.stores || []).length);

  let client, nLocations, logEntries;
  if (isStd) {
    client = std.site || std.client || "Standard DAR";
    logEntries = std.log || [];
    nLocations = (std.site || std.client) ? 1 : 0;
  } else {
    client = S.client || "Cracker Barrel — SOC";
    const stores = S.stores || [];
    nLocations = stores.length;
    logEntries = [];
    stores.forEach(st => {
      (st.log || []).forEach(e => {
        logEntries.push(Object.assign({}, e, {
          loc: st.num ? "CB #" + String(st.num).padStart(4, "0") : "—"
        }));
      });
    });
  }

  const events = S.shiftEvents || [];
  const operators = [];
  events.forEach(e => {
    if (e.guard && operators.indexOf(e.guard) === -1) operators.push(e.guard);
  });

  return {
    client,
    date: S.date || "",
    start: S.start || "",
    end: S.end || "",
    nLocations,
    nEntries: logEntries.length,
    operators,
    logPreview: logEntries.slice(0, 4),
  };
}

function buildBrandedEmailHtml(data, generatedAtStr, testMode) {
  const s = collectSummary(data);
  const opList = s.operators.map(esc).join(", ") || "—";

  let rows = "";
  s.logPreview.forEach(e => {
    const at = e.at || "";
    let timePart = at;
    if (at.indexOf("T") !== -1) timePart = at.split("T")[1].slice(0, 5);
    const loc = e.loc || "—";
    const note = e.note || e.type || "";
    rows += `<tr>
      <td style="padding:6px 8px 6px 0;border-bottom:1px solid #eeeeee;color:#555555;width:60px;font-family:Consolas,monospace;">${esc(timePart)}</td>
      <td style="padding:6px 8px 6px 0;border-bottom:1px solid #eeeeee;color:#555555;width:90px;">${esc(loc)}</td>
      <td style="padding:6px 0 6px 0;border-bottom:1px solid #eeeeee;color:#111111;">${esc(note)}</td>
    </tr>`;
  });

  let moreNote = "";
  const remaining = s.nEntries - s.logPreview.length;
  if (remaining > 0) {
    moreNote = `<p style="margin:8px 0 0 0;font-size:11px;color:#888888;">+ ${remaining} more entr${remaining === 1 ? "y" : "ies"} — see attached PDF for the full consolidated log.</p>`;
  }

  let testBanner = "";
  if (testMode) {
    testBanner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2b2b30;">
      <tr><td style="padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#e9e9ec;text-align:center;">
        TEST MESSAGE — verifying the automatic shift email pipeline end to end (branded body + real PDF via Microsoft Graph).
      </td></tr></table>`;
  }

  const shiftRange = s.date ? `${fmtDate(s.date)} · ${esc(s.start)}–${esc(s.end)}` : "—";

  return `${testBanner}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e9ec;">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border:1px solid #cccccc;">

  <tr>
    <td style="padding:22px 26px 14px 26px;border-bottom:3px solid #C8102E;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td valign="bottom">
            <p style="margin:0;font-size:18px;font-weight:bold;letter-spacing:1px;color:#C8102E;">STRICKLAND SECURITY</p>
            <p style="margin:2px 0 0 0;font-size:11px;letter-spacing:2px;color:#555555;text-transform:uppercase;">Daily Activity Report</p>
          </td>
          <td valign="bottom" align="right">
            <p style="margin:0;font-size:11px;color:#555555;">Generated automatically</p>
            <p style="margin:2px 0 0 0;font-size:11px;color:#555555;font-family:Consolas,monospace;">${esc(generatedAtStr)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:16px 26px;border-bottom:1px solid #dddddd;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 18px 0 0;font-size:10px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Client</td>
          <td style="padding:0 18px 0 0;font-size:10px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Shift</td>
          <td style="padding:0;font-size:10px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Operator(s)</td>
        </tr>
        <tr>
          <td style="padding:2px 18px 0 0;font-size:13px;color:#111111;font-weight:bold;">${esc(s.client)}</td>
          <td style="padding:2px 18px 0 0;font-size:13px;color:#111111;font-family:Consolas,monospace;">${shiftRange}</td>
          <td style="padding:2px 0 0 0;font-size:13px;color:#111111;">${opList}</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="padding:16px 26px 4px 26px;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 8px 0;font-size:10px;color:#888888;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #dddddd;padding-bottom:6px;">
        Shift summary &mdash; ${s.nLocations} location${s.nLocations !== 1 ? "s" : ""}, ${s.nEntries} log entr${s.nEntries === 1 ? "y" : "ies"}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;">
        ${rows || '<tr><td style="padding:8px 0;color:#888888;">No log entries recorded this shift.</td></tr>'}
      </table>
      ${moreNote}
    </td>
  </tr>

  <tr>
    <td style="padding:18px 26px 22px 26px;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="border-top:1px solid #111111;padding-top:6px;font-size:10px;color:#555555;text-transform:uppercase;letter-spacing:1px;">
            Full consolidated report attached as PDF
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0 0;font-size:10px;color:#999999;">Strickland Security &amp; Safety Solutions, LLC &mdash; internal shift record, sent automatically the morning after a completed overnight shift.</p>
    </td>
  </tr>

</table>

</td></tr>
</table>`;
}

module.exports = { buildBrandedEmailHtml, collectSummary };
