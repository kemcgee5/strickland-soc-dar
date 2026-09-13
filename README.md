# Strickland SOC DAR — dedicated project

This is its own standalone project (separate from the Fieldline demo), same
pattern as CK Pressure Washing: one GitHub repo, one Vercel project.

- `public/index.html` — the actual DAR tool your team signs into every night.
  Real Supabase credentials are already baked in, so it works the moment
  it's deployed — nothing to paste.
- `api/send-shift-emails.js` (+ `lib/*.js`) — the function that emails you
  the branded PDF report every morning after a completed overnight shift.
- `.github/workflows/shift-email-trigger.yml` — pings that function every
  15 minutes so it can check "is it ~8am ET right now?" (see "Why GitHub
  Actions, not Vercel Cron" below).

## One-time setup

1. **Create a new GitHub repo** (e.g. `strickland-soc-dar`), same as you did
   for Fieldline-demo. Upload every file in this folder to it (including the
   `.github` folder — GitHub sometimes hides dot-folders in a drag-and-drop
   upload, so if it doesn't show up after uploading, use "Add file → Upload
   files" and drag the `shift-email-trigger.yml` in directly, or use `git`
   from the command line instead of the web uploader).

2. **Import it into Vercel as a new project** (Vercel dashboard → Add New →
   Project → import that GitHub repo), same as your CK Pressure Washing
   setup. Once imported, its `public/index.html` is live immediately at the
   `.vercel.app` URL Vercel gives you — that's your new permanent SOC DAR
   link going forward. From now on, every time I send you an updated file
   and you push it to this repo, Vercel redeploys automatically — everyone
   just refreshes the page to get the newest version, nothing else to do.

3. **Add Environment Variables** in that Vercel project (Settings →
   Environment Variables) — the actual values are in our chat, not in any
   file in this repo (never paste real secrets into a file you commit):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `JOB_SECRET` (matches the secret baked into `strickland_soc_email_job_functions.sql`)
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `SENDER_EMAIL` (kejuan@stricklandsecurity.com)
   - `RECIPIENT_EMAIL` (kemcgee5@gmail.com for now — change this once live)
   - `CRON_SECRET` (a random value I generated — also in chat; this just
     stops random internet traffic from triggering an email send by hitting
     the URL directly)

   After adding them, redeploy once (Vercel → Deployments → ⋯ → Redeploy) so
   the function picks them up.

4. **Add the matching GitHub Actions secret**: in the GitHub repo → Settings
   → Secrets and variables → Actions → New repository secret → name it
   `CRON_SECRET`, same value as step 3.

5. **Edit `.github/workflows/shift-email-trigger.yml`**: replace
   `YOUR-VERCEL-PROJECT.vercel.app` with your real Vercel deployment URL from
   step 2, then commit that change.

6. **Test it manually** before trusting it to run on its own: GitHub repo →
   Actions tab → "Trigger daily shift email check" → "Run workflow" → Run.
   Check the run's log for `HTTP 200`. If it's currently not 8am Eastern
   when you test, you'll see `"ranJob": false` in the response — that's
   correct behavior, not a failure. To actually see a send happen during
   testing, temporarily edit the `hour !== 8` check in
   `api/send-shift-emails.js` to match the current Eastern hour, push,
   trigger the workflow, confirm the email arrives, then change it back to
   `8` and push again.

## Why GitHub Actions, not Vercel's own Cron Jobs

Vercel's Hobby plan only allows cron jobs that run **once per day**, with
timing that can land anywhere within a whole hour — not precise enough to
reliably land on "8am Eastern" once Daylight Saving shifts the UTC offset.
Vercel Pro removes that limit ($20/mo), but GitHub Actions' own scheduler
does the same 15-minutes-a-day polling for free, with no plan requirement —
so that's what's wired up here. If you'd rather pay for Vercel Pro later and
consolidate onto Vercel's own Cron Jobs instead, that's a small change to
make when you're ready.

## How the daily send actually works

Every 15 minutes, `api/send-shift-emails.js` runs and immediately checks the
real current time in America/New_York (handles Daylight Saving automatically
— no manual clock changes needed, ever). If it's not currently 8am Eastern,
it does nothing and exits. If it is, it asks Supabase (via the two functions
in `strickland_soc_email_job_functions.sql` — **make sure you've run that
SQL file**, along with `strickland_soc_shift_saves_and_reports.sql`, in the
Supabase SQL Editor if you haven't already) for any shift reports from
yesterday that haven't been emailed yet. For each one:
- If it wasn't both started AND ended, it's skipped — no email.
- Otherwise, it renders the exact same PDF you'd get from clicking "Shift
  DAR PDF" in the tool, builds the branded email, and sends it via
  Microsoft Graph (real styling, real logo colors, real PDF attached — not
  the Outlook connector, which strips all of that).
- Either way, it's marked so it's never sent twice, even if this function
  happens to run more than once inside the 8am hour.

## If the Vercel deploy fails on `@sparticuz/chromium`

Some serverless platforms hit a function-size limit with the full Chromium
package bundled in. If that happens, tell me and I'll switch
`lib/renderPdf.js` and `package.json` over to `@sparticuz/chromium-min`
(fetches the Chromium binary from a remote URL at cold start instead of
bundling it) — a quick swap, not a rebuild.
