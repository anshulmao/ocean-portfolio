# Ocean portfolio deployment plan

Status: planned; no live deployment created.

## Recommended release

Use Vercel with the private `anshulmao/ocean-portfolio` GitHub repository. This is a static browser application; no server, database or production secrets are required.

1. Package only the runtime scene, assets, vendor libraries and root redirect into `public/`. Exclude concept boards, QA scripts/captures, prompts and internal documentation. Keep asset attribution with the runtime.
2. Import the repository into the intended Vercel account/team. Choose Framework **Other**, with a packaging build and output directory `public`. Keep relative asset URLs intact.
3. Create a protected preview from a release branch. Verify cold model loads, actual WebGL support, pointer lock, touch controls, first/third-person transitions, all waypoint panels, PDF and external links. Check desktop and a physical phone; software-rendered automated QA does not establish device FPS.
4. Review every included portfolio image and resume for public distribution. A private GitHub repository does not make deployed assets private. Generated deployment URLs are publicly accessible unless deployment protection is configured.
5. After preview acceptance, promote the verified commit to production, then connect the chosen custom domain and verify HTTPS and paths. Preserve the previous deployment for rollback.

## Performance and release checks

Keep GLB loading lazy, preserve the economy renderer, and serve versioned assets with long caching only when filenames include a content hash. HTML should revalidate so releases do not leave stale module/asset references. Inspect transferred bytes and model decode time on a real phone/network before release. Preserve reduced-motion and fallback messaging.

## Official setup references

- [Static framework and output directory configuration](https://vercel.com/docs/builds/configure-a-build)
- [GitHub preview deployment integration](https://vercel.com/docs/git/vercel-for-github)
- [Deployment URL visibility](https://vercel.com/docs/deployments/generated-urls)

Actual deployment, team selection and domain changes remain a separate authorized release step.
