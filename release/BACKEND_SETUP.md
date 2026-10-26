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
rows after a lost response. Contact fields are discarded without explicit consent.
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
Free-tier inactivity pausing still applies; no keepalive automation is installed.

## PostHog

Set `posthogToken` and `posthogHost` in `ocean-refined/services-config.js` from the
project's browser installation snippet. These are public browser settings, not a
personal API key. Until set, analytics remains inactive and its toggle is disabled.
The connected PostHog plugin did not expose callable tools in the setup session.

Analytics is off until enabled in ocean Settings, the reading-page footer or the
privacy page. Turning it off stops capture; Do Not Track and Global Privacy Control
take precedence. Session replay, automatic click/form capture, surveys, error
capture and external SDK dependencies are disabled. Only named events and a small
property allowlist are emitted. URL query strings/fragments and initial attribution
fields are removed. No feedback text, contact information or photo content is sent.

Events: pageview/pageleave, project/section opened, project link clicked, résumé
clicked, contact clicked, dive started/completed, feedback started/saved, reef photo
downloaded/shared, artifact collected. Page visits cover both ocean and static
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

The backend has been deployed and verified. The frontend changes are not deployed
to production yet. PostHog ingestion into the user's project still needs the
browser token/host and a real event check after deployment.
