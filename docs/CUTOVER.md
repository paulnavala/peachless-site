# Cutover runbook — peachless.design → self-hosted

First step — merge to main:
1. Merge PR #2 (astro-rebuild → main): https://github.com/paulnavala/peachless-site/pull/2
   This replaces the old static-HTML shell on `main` and triggers the GitHub Pages
   deploy (Pages is already enabled on the repo with `build_type=workflow`).

Pre-flight (all must be true):
- [ ] CI green on main; preview URL renders all 9 pages correctly
- [ ] Visual parity pass complete (Task 23)
- [ ] Form service configured: create a (free) Formspree or Web3Forms endpoint for
      patricia@peachless.design, put the URL in `src/content/site/site.yaml` →
      `formEndpoint` (Web3Forms also needs `formHidden: { access_key: "..." }`),
      commit, deploy, and send a real test message from /contact.
      Caveat: write `formEndpoint`/`formHidden` directly in git — editing Site
      Settings via the CMS may strip manually-added `formHidden` keys.
- [ ] Sveltia CMS login verified at <pages-url>/admin/ (GitHub token)
- [ ] Cloudflare Pages: check the Cloudflare dashboard for a Pages project connected
      to `paulnavala/peachless-site` and remove it if present (the old static-shell
      README configured one with custom domain peachless.design; if left connected
      it will fight GitHub Pages for the domain)

DNS cutover (requires access to the peachless.design DNS zone):
1. Add the custom domain to Pages:
   `gh api -X PUT repos/paulnavala/peachless-site/pages -f "cname=peachless.design"`
   and commit a `public/CNAME` file containing `peachless.design` so deploys keep it.
2. At the DNS provider, replace the Squarespace records:
   - Apex `peachless.design`: A records → 185.199.108.153, 185.199.109.153,
     185.199.110.153, 185.199.111.153 (remove Squarespace A/CNAME records)
   - `www` CNAME → `paulnavala.github.io`
3. Wait for DNS + cert provisioning (minutes to ~1h), then enable
   "Enforce HTTPS" in the repo's Pages settings.
4. Verify: https://peachless.design loads the new site; https://www.peachless.design
   redirects to apex; /uiux, /home, /projects/graphic-design, /projects/ui-ux all land
   on their new pages; /sitemap-index.xml serves.

Post-cutover:
- [ ] Submit the new sitemap in Google Search Console (property: peachless.design)
- [ ] Keep `assets.peachless.design` (old repo, sqs-design) frozen but DEPLOYED —
      nothing references it anymore, but don't delete until confident
- [ ] Cancel the Squarespace subscription (all images/text were migrated in Task 2;
      verify `docs/reference/` has everything first)
- [ ] After 30 days of stability: archive the old sqs-design repo
