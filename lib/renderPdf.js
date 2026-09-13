/**
 * Headless PDF renderer for a Strickland SOC shift report -- the Node/
 * Vercel port of the original render_shift_pdf.py used during development.
 *
 * Reuses the dashboard's OWN print CSS/JS unmodified (the exact bundled
 * public/index.html shipped to real users), so this is the same rendering
 * path a human gets from clicking "Shift DAR PDF" in their browser, just
 * driven headlessly and fed one shift's archived JSON via the tool's
 * existing #seedData / loadSeed() import mechanism instead of a real
 * Supabase session.
 *
 * IMPORTANT: public/index.html now ships with the REAL Supabase URL/anon
 * key baked in (so real users don't need to paste anything). loadSeed()
 * only runs when boot() runs, which only happens when
 * checkAuthAndRender() takes its "no Supabase configured" branch -- so
 * this render copy swaps those two constants back to placeholders in
 * memory only, exactly for this one headless render. It never touches
 * the real file or the real Supabase project.
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

function buildRenderHtml(dashboardHtml, shiftData) {
  let html = dashboardHtml
    .replace(/var SUPABASE_URL = '[^']*';/, "var SUPABASE_URL = 'YOUR_SUPABASE_URL';")
    .replace(/var SUPABASE_ANON_KEY = '[^']*';/, "var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';");

  const seedJson = JSON.stringify(shiftData).replace(/<\//g, "<\\/");
  const seedTag = `<script id="seedData" type="application/json">${seedJson}</script>\n</head>`;
  if (html.indexOf("</head>") === -1) throw new Error("dashboard HTML missing </head>");
  html = html.replace("</head>", seedTag);
  return html;
}

async function renderShiftPdf(shiftData) {
  const dashboardHtml = fs.readFileSync(path.join(process.cwd(), "public", "index.html"), "utf-8");
  const renderHtml = buildRenderHtml(dashboardHtml, shiftData);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(renderHtml, { waitUntil: "load" });
    await new Promise(r => setTimeout(r, 400));

    // Sanity check: confirm the archived shift actually loaded, not a
    // blank shift. S/archived are top-level `let` in the tool's script,
    // so they are NOT window properties -- reference the bare
    // identifiers via an in-page function instead.
    const nStores = await page.evaluate(() => {
      try {
        // eslint-disable-next-line no-undef
        return (typeof S !== "undefined" && S && S.stores) ? S.stores.length : -1;
      } catch (e) { return -1; }
    });
    if (nStores < 0) {
      throw new Error("S was never populated -- loadSeed()/boot() did not run as expected");
    }

    await page.emulateMediaType("print");
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { renderShiftPdf, buildRenderHtml };
