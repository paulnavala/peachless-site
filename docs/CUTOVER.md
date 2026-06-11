# Cutover runbook — peachless.design → Cloudflare Pages

Status:
- PR #2 (astro-rebuild → main) and PR #3 (polish/components) are already merged.
- The Cloudflare Pages project **peachless** is connected to `paulnavala/peachless-site`
  via the Cloudflare GitHub app: it auto-builds `main` and is serving the up-to-date
  Astro site at https://peachless.pages.dev. PRs get preview deployments (a
  "Cloudflare Pages" commit status appears on each PR).

Pre-flight (completed):

- [x] Form service wired: endpoint set in `src/content/site/site.yaml` →
      `formEndpoint` (plus `formHidden` access key where required) and a real test
      message sent and received from /contact.
      Caveat: write `formEndpoint`/`formHidden` directly in git — editing Site
      Settings via the CMS may strip manually-added `formHidden` keys.
- [x] Sveltia CMS sign-in verified at /admin/ (GitHub token)
- [x] Visual parity pass complete

Cutover:

1. In the Cloudflare dashboard, confirm the Pages project **peachless** build
   settings: production branch `main`, build command `npm run build`, build output
   directory `dist`. (It is already building correctly — this is a confirmation
   step, not a change.)
2. Add the **peachless.design** site (zone) to the Cloudflare account (Free plan)
   and let Cloudflare import the existing DNS records.
3. At the domain **registrar**, change the nameservers from
   `ns-cloud-c1..c4.googledomains.com` (Google Cloud DNS) to the two
   Cloudflare-assigned nameservers. The registration stays where it is — only DNS
   moves. This replaces any record edits in Google Cloud DNS: CF Pages apex custom
   domains need the zone on Cloudflare DNS (CNAME flattening), so the cutover is a
   nameserver change, not A/CNAME edits at Google.
4. In the Pages project → **Custom domains**: add `peachless.design` and
   `www.peachless.design`. Cloudflare DNS auto-creates the records once the zone
   is active.
5. Add a redirect rule (zone → Rules → Redirect Rules): requests to
   `www.peachless.design/*` → 301 `https://peachless.design/$1`.
6. Verify:
   - https://peachless.design serves the site with valid TLS
   - https://www.peachless.design 301s to the apex
   - `/uiux`, `/home`, `/projects/ui-ux`, `/projects/graphic-design` return 301s
     straight to their targets (served by `public/_redirects`)
   - `/sitemap-index.xml` serves
   - `/admin/` loads and CMS sign-in works on the production URL
7. Decommission GitHub Pages:
   `gh api -X DELETE repos/paulnavala/peachless-site/pages`
   (kills the github.io URL and releases the custom-domain claim).

Post-cutover:

- [ ] Submit the new sitemap in Google Search Console (property: peachless.design)
- [ ] Keep `assets.peachless.design` (old repo, sqs-design) frozen but DEPLOYED —
      nothing references it anymore, but don't delete until confident
- [ ] Cancel the Squarespace subscription (all images/text were migrated in Task 2;
      verify `docs/reference/` has everything first)
- [ ] After 30 days of stability: archive the old sqs-design repo
