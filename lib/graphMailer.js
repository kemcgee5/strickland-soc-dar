/**
 * Microsoft Graph API mailer (app-only / client-credentials flow).
 *
 * Unlike the Outlook connector used earlier during development (confirmed
 * to strip all style=/bgcolor HTML on send and to have no attachment
 * support at all), Graph's sendMail endpoint sends HTML byte-for-byte and
 * supports real file attachments. Requires an Azure AD app registration
 * with the Application permission Mail.Send (admin-consented).
 */

const GRAPH_TOKEN_URL = (tenantId) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const GRAPH_SEND_URL = (mailbox) =>
  `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`;

async function getGraphToken(tenantId, clientId, clientSecret) {
  const resp = await fetch(GRAPH_TOKEN_URL(tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Graph token request failed (${resp.status}): ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text);
  if (!json.access_token) {
    throw new Error(`Graph token response missing access_token: ${text.slice(0, 500)}`);
  }
  return json.access_token;
}

async function sendMailWithAttachment(accessToken, senderMailbox, toEmail, subject, htmlBody, pdfBuffer, pdfFilename) {
  const message = {
    subject,
    body: { contentType: "HTML", content: htmlBody },
    toRecipients: [{ emailAddress: { address: toEmail } }],
  };
  if (pdfBuffer) {
    message.attachments = [{
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: pdfFilename || "shift-report.pdf",
      contentType: "application/pdf",
      contentBytes: Buffer.from(pdfBuffer).toString("base64"),
    }];
  }

  const resp = await fetch(GRAPH_SEND_URL(senderMailbox), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, saveToSentItems: "true" }),
  });

  if (resp.status !== 202) {
    const text = await resp.text();
    throw new Error(`Graph sendMail failed (${resp.status}): ${text.slice(0, 800)}`);
  }
  return true;
}

module.exports = { getGraphToken, sendMailWithAttachment };
