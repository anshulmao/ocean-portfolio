# Ocean portfolio copy review

## Existing baseline

`PORTFOLIO_CONTENT` adapts existing copy from `../index.html` into ocean panel data. Existing copy is the baseline; inclusion here does not establish new user approval or confirm public deployment. Some headings combine existing career chapters, and facts shorten existing phrases for scanning.

- About: hero, operating principles, capabilities, contact, and footer.
- Experience: three chapters covering Product Manager, Product Content Manager, and consulting foundations. The last chapter combines Consultant Analyst and Advisory Maverick while retaining both titles and dates.
- Projects: existing Rae, WattMana, Sage, and OpenClaw cards and detail dialogs.
- Private corroboration: `../../../career/context/experience-master.md` (repository path `career/context/experience-master.md`), professional overview, Twimbit role scope, Sage, and OpenClaw sections.
- Scope: `../site-scope.md`. Existing interaction wording was inspected in `../script.js`; interview reflections are excluded from this content export.

The export excludes client identities, client artifacts, adoption figures, platform commercial outcomes, internal pilot targets, private career evidence, and source-file paths. It retains qualitative ownership wording already present in the website. WattMana remains a prototype story with modeled device estimates. Sage remains a health-organization product with the existing clinical-judgment boundary.

Links reuse existing website destinations. GitHub profile links are labeled as profiles, not project repositories. No Sage demo or repository destination is invented. The Rae destination is an existing public-story link; its availability was not checked in this content-only task.

## Proposed variants — awaiting user approval

`COPY_VARIANTS` contains **new drafts**, separate from the existing baseline. Each style proposes one short introduction per section; it does not rewrite entry claims.

| Style | Intended emphasis |
| --- | --- |
| Concise | Fast overview of role, progression, and project range |
| Story | Human workflow, learning, and product reasoning |
| Technical | Discovery linked to retrieval, evaluation, system behavior, and enablement |

Review the exact introductions in `portfolio-content.js` before accepting a style. Selection in a local preview is a review choice, not approval to publish.

## Data API and validation

- Named ES-module export `PORTFOLIO_CONTENT`: keys `about`, `experience`, `projects`; each has `title`, `subtitle`, and `entries`.
- Every entry: `id`, `title`, `tag`, `summary`, `body` (paragraph strings), `facts` (strings), `links` (objects containing `label`, `url`).
- Named export `COPY_VARIANTS`: keys `concise`, `story`, `technical`; each has `label`, `about`, `experience`, and `projects` strings.
- This change supplies data only. It does not edit interface files or claim browser, mobile, or physical-device acceptance.

## Resume and project media additions

The Resume section uses the exact PDF already bundled in the existing portfolio (`assets/Anshul_Ramprasad_AI_PM_Resume_20260709_v2.pdf`), copied as `assets/portfolio/portfolio-resume.pdf`. Its July 2026 version is shown explicitly; the preview is rendered from that same PDF. The private Agent Strategist source is used to locate work-sample links, not copied into the client bundle.

Added the verified live Sage and Rae Engage destinations and browser captures; see `assets/portfolio/PROJECT_MEDIA.md`. The Rae image is specifically the Rae Engage public widget, not the enterprise Rae platform. The Sage screenshot is an empty Ramble composer, without existing health records. Existing copy and draft styles retain their approval boundaries.

Rae Engage now has its own entry, distinct from the enterprise Rae platform. Its new short summary is grounded in the experience bank’s Rae Engage pilot ownership and direct build contribution; it remains a draft for user review. It makes no conversion or adoption result claim. The selector’s default is labeled Baseline copy rather than approved copy.
