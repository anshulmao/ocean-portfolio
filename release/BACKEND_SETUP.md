# Portfolio backend and analytics

The public portfolio remains a static build. Supabase accepts explicit submissions;
the PostHog browser SDK is pinned in package.json and loads only after analytics is enabled.
No wizard AI analysis or repository upload is used.

## Supabase

- Project: `ocean-portfolio` in `anshulmao's Org`, Singapore.
- Dashboard: https://supabase.com/dashboard/project/ngtdxvgsauaqioygadlk
- Function: `portfolio-intake`, with `/feedback` and `/photo` routes.
- Schema: `supabase/schema.sql`, applied remotely as `portfolio_private_intake`.
- Runtime: `supabase/functions/portfolio-intake/`; no external runtime dependencies.
- Public browser configuration: `ocean-refined/services-config.js`.

All three application tables have RLS enabled, no browser grants, and no public
read/write policies. The intentional absence of policies is a deny-by-default
choice; the security advisor reports informational notices for this. Server
credentials are confined to the function environment. The function checks the
application's public key, validates input, accepts only configured origins, and
applies atomic database counters. Origin and public-key checks are not visitor
authentication; the global caps bound submissions even if a client spoofs headers.

Feedback is limited to five requests per network hash per hour and 500 requests
per day globally. Retrying an unchanged note uses the same UUID, avoiding duplicate
rows after a lost response. Contact fields are stored only when the visitor enters a name or email in the feedback form.
The form preserves the note on failure and acknowledges only a confirmed save.

Taking a reef photo still downloads a PNG locally. Afterward, Settings exposes
“Share last reef photo”, with a preview and separate confirmation. Only this action
uploads a JPEG of at most 1280 × 720 pixels / 1 MB. The private `reef-photos` bucket
has no public listing or download policy. Limits are three requests per network
hash per hour and 20 requests per day globally. Photos and notes can be reviewed
and deleted using the Supabase dashboard; a custom admin is not included.

Quota windows are fixed, not sliding. Address hashes are keyed with a backend secret;
raw addresses are not written to application tables. Old counter rows are deleted
on the next submission after two days. Hosting/provider logs are separate.

Allowed origins currently include the existing Vercel site and localhost port 4190.
Add the purchased domain to DEFAULT_ORIGINS and redeploy the function when ready.
Free-tier inactivity pausing (after a week) is prevented by `.github/workflows/supabase-keepalive.yml`: every three days it reads one
row through the REST API with the public key (`tools/supabase-keepalive.mjs`, no secrets) and fails, so GitHub emails the owner, if Supabase
answers with a 5xx or not at all. It cannot wake a project that is already paused: restore that in the Supabase dashboard. It runs only
from `main`; after merging, try it once from Actions → Supabase keepalive → Run workflow.

## PostHog

The connected PostHog account belongs to `anshulramprasad@gmail.com`. Its only
organization is `ARP Enterprise`, with one non-demo `Default project` (ID `688555`).
The project's public browser token and US ingestion host are configured in
`ocean-refined/services-config.js`; they are not a personal API key. The PostHog
plugin supplied these settings in the follow-up session without sharing source
code with PostHog AI. No event had been ingested before this integration.

Analytics is on by default and can be turned off in ocean Settings, the reading-page
footer or the privacy page. Turning it off stops capture; Do Not Track and Global Privacy Control
take precedence. Session replay, automatic click/form capture, surveys, error
capture and external SDK dependencies are disabled. Only named events and a small
property allowlist are emitted. URL query strings/fragments and initial attribution
fields are removed. No feedback text, contact information or photo content is sent.

Events: pageview/pageleave, project/section opened, project link clicked, résumé
clicked, contact clicked, dive started/completed, feedback started/saved, reef photo
downloaded/shared, artifact collected. Once per visit the ocean also reports how it ran
(`ocean-refined/health-report.js`): `world_ready` or `world_failed`, `world_health` when the
page is left (frame times, slow-frame share, whether the visitor dived) and up to three
`script_error` events naming the script and line, never the message. Device values are
coarse: graphics family, quality tier and a width class. Page visits cover both ocean and static
reading/project pages. Unique visitors are estimates for consented browsers;
blocked scripts and the SDK's default bot filter reduce coverage.

`tools/sync-services.mjs` copies the pinned SDK locally for source development.
The production build copies it to dist/vendor automatically. Reading pages stay
fully usable without JavaScript or analytics; the 3D engine is never loaded there.

## Verification

- `npm run test:services`: input validation, consent, quotas, storage errors,
  idempotent feedback requests, photo cleanup, analytics property/URL filtering.
- `npm run test:services:browser`: real PostHog SDK against intercepted ingestion;
  no requests before consent, failure/retry behavior, contact opt-in, explicit
  photo upload and analytics opt-out. Uses installed Edge by default; override
  PLAYWRIGHT_CHANNEL as needed. Bot filtering is disabled only in the test fixture.
- `npm run test:build`: asset integrity and static reading-page links.
- `node --use-system-ca tools/test-intake-live.mjs`: opt-in live test creating a
  synthetic note; prints its UUID for inspection/cleanup. Verifies public table
  access is denied. Never reads server credentials.

Live tests confirmed feedback saves, duplicate-free retries, public table denial,
and a real JPEG upload with blocked public download. The synthetic feedback was
deleted. A 2.4 KB synthetic photo remains archived for reference:
`521c27c6-c160-448f-9c8a-4bb762bd26de.jpg` in the private `reef-photos` bucket.

The frontend is deployed to production at
`https://anshul-portfolio-rho.vercel.app/` from PR #6's branch commit
`bc1ab22ff2b1085b87e770a7e6a2d79a6cac9867` (Vercel deployment
`dpl_4bPWypG97xEBWQA81kZXjojYavUT`). The PR remains a draft and `main` still
points to the older release; a later `main` deployment can replace this build.
The deployed configuration and privacy page return HTTP 200. The existing Supabase
project is `ACTIVE_HEALTHY` and `portfolio-intake` is active.

The production browser's reading page initially showed analytics off. Enabling it
changed the control to on and PostHog project `688555` received a `$pageview` at
`2026-10-26T08:03:51.250Z`, with `$pathname=/profile.html` and
`experience=reading`. The ocean page loaded and its Settings showed analytics on.
No real visitor data or feedback text was submitted for this check. The local
execution sandbox blocks outbound PostHog traffic, so local tests intercept the
SDK endpoint; the production event above is the live ingestion proof.

