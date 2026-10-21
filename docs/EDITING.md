# Editing peachless.design

This guide covers everything you need to update the site yourself: new projects, photos, page text and settings. You don't need to know any code. Every field in the editor also has a short hint underneath it.

**The editor:** https://peachless.design/admin/ (works best in Chrome or Edge on a computer).

---

## 1. Signing in

1. Open https://peachless.design/admin/.
2. Click **Sign In with GitHub**. The first time, GitHub asks you to approve "peachless. admin". Click **Authorize**.
3. You're in. Next time it remembers you.

**The very first time:** you'll get an email from GitHub inviting you to the `peachless-site` repository. Accept it first. If the editor says *"You have a pending invitation"*, accept the invitation on GitHub, then sign in again.

---

## 2. A quick tour

The menu on the left:

| Item | What it is |
|---|---|
| **Projects** | Your portfolio. Each project has its own page and a card on the Work page. |
| **Photos** | Your photography, with optional before/after comparisons. |
| **Home page** | The headline, introduction and section titles on the home page. |
| **Work page** | The Work page's title and introduction, and the text for each filter (Graphic design, UI/UX, Photography). |
| **About page** | Your portrait, statement and story. |
| **Contact page** | The heading, introduction, contact-form texts and the fortunes in the fortune peach. |
| **Photography page** | The heading and introduction of the photography page. |
| **Site settings** | Site name, your name, tagline, menu, email addresses, social links and the "Let's create together" invitation in the footer. |
| **Contact form — developer** | Locked: the technical setup of the contact form. You can look, but there's nothing to change here. |

---

## 3. How changes go live

You can always check your change before anyone sees it.

| You want to… | Do this | Live after |
|---|---|---|
| Check a change first (recommended) | **Save** → **View Preview** → **Publish** | About 2 minutes after Publish |
| Fix a small typo | **Save and Publish** | About 2 minutes |
| Change the order of projects or photos | **Reorder Entries** → drag → **Done Reordering Entries** | About 2 minutes |

### Save → View Preview → Publish

1. Make your changes, then click **Save**. Your change is now a **draft**; the live site hasn't changed.
2. A private preview of the whole site starts building. After a minute or two, **View Preview** opens it. (*"Checking for Preview…"* or *"The preview is still being built."* means wait a moment.)
3. Look around the preview: the project page, the Work page, the home page. Want to change something? Edit and **Save** again; the preview rebuilds.
4. Happy with it? Click **Publish**. About two minutes later it's live on peachless.design.

- **Changed your mind?** **Discard Changes** brings back the version that's live.
- **Unfinished drafts** wait for you under **Drafts**.

> **The live site is protected.** If a change can't be built, it simply doesn't go live. Visitors keep seeing the last working version.

---

## 4. Adding a project

1. **Projects** → **New project**.
2. Fill in the basics:
   - **Project name**: shown on the card, at the top of the page and in Google.
   - **One-line summary**: one sentence: what it is and who it's for.
   - **Type of work**: Graphic design, UI/UX, or both. This decides which Work filters show it.
   - **Year**, **Client or context** (a client's name, or "Concept project", "University coursework"…), **My role**, **Tools used**: all optional, but they help tell the story.
3. **The address.** When you create a project you also choose its web address, e.g. `peachless.design/projects/fish-seafood`. Use lowercase letters, numbers and dashes. **It can't be changed later**, because people may link to it, so pick something short and lasting.
4. **Cover image**: the picture on the Work page and at the top of the project page (see [Images](#6-images)).
   - **Background colour** and **Fit**: for a logo with a transparent background, choose a background and **Show the whole image**. **Project colour** (a soft tint of the colour below) usually looks best; Linen, Paper, Blush, Clay and Espresso are there too. For a photo or screenshot, choose **None** and **Fill the card**.
5. **Project colour**: pick the main colour of the logo (CERN's navy, Fish & Seafood's blue…) or type its code, like `#0071BC`. The site makes soft tints from it for the top of the project page, its card and the "Next project" band, so each project has its own atmosphere. Any colour is safe: the site always keeps the text readable. Leave it empty for the site's peach tones.
6. **Story**: add the sections that tell the project (next chapter).
7. **Save** → **View Preview** → **Publish**.

A new project appears **first** on the Work page. To move it, use **Reorder Entries** on the Projects list.

---

## 5. Telling the story

The **Story** is a list of sections. Add them with the **+** button, drag them to reorder, and collapse them to keep things tidy. A good project story usually follows:

**The brief** (what was the challenge?) → **The idea** → **The process** → **The result**.

**Chapters.** Every section with a heading becomes a numbered chapter (01, 02…). With three or more, an **In this story** list at the top of the page links to each one, so short headings like "The brief" or "The app" work best.

| Section | Use it for | Tips |
|---|---|---|
| **Text** | A heading and a few paragraphs | Headings like "The brief", "The idea", "The result". Keep paragraphs short. |
| **Image** | One image with an optional caption | **Width**: *Text width*, *Wide*, or *Full width (edge to edge)*. Wide and full-width images need at least 2000 px. |
| **Gallery** | 2–12 images in a grid: screens, details, sketches | **Device frame**: *Phone* shows app screens inside phones (a swipeable row on phones, a staggered row on computers); *Browser window* shows web pages inside browser windows; *None* is a plain grid, with portrait images up to four across and landscape ones two across. Upload the screens without a frame — the site draws it. |
| **Quote** | A short, large quotation that lights up word by word as visitors scroll past | Add **Who said it** for client feedback. |
| **Logo** | Logo versions side by side | Each version gets its own background colour and an optional label ("Primary", "Monochrome"). |
| **Colour palette** | Brand colours visitors can copy | A name and a six-digit hex colour, like `#D29A84`. |
| **Brand guidelines** | The pages of a brand book, readable full screen | Export each page as a PNG (about 2400 px wide) or an SVG **with text converted to outlines**. Otherwise visitors see the wrong fonts. |
| **Figma prototype** | An interactive prototype visitors can try | In Figma: **Share → Copy link**, with access set to "Anyone with the link". **Device frame**: for an app choose *Phone* and use one of its screens as the **Preview image**; for a website choose *Browser window*. Without a preview image, the cover is used. |
| **Before & after** | A slider comparing two images | Both images must have the **same size and crop**. |

---

## 6. Images

**Sizes**

| Image | Size |
|---|---|
| Cover | At least 1600 px wide |
| Wide or full-width story images | At least 2000 px wide |
| Logos | Transparent PNG or SVG |
| Brand book pages | PNG about 2400 px wide, or SVG with outlined text |
| Phone screens (Device frame: Phone) | The screen only, no phone around it, exported at 2× (about 800 px wide) |
| Website screenshots (Device frame: Browser window) | The page only, no browser bar, about 2000 px wide |
| Share image (Search & sharing) | 1200 × 630 px |
| Photos | Any size: large uploads are resized automatically |

You don't need to shrink or compress anything: the site makes small, fast versions of every image for each screen size. File names don't matter either; they're tidied up automatically.

**Describe the image.** Every image has a short description for people who can't see it (screen readers) and for Google. Write what someone should know about the image:

- ✅ "The TON logo, a wordmark with a musical note rising from the O"
- ✅ "A red fox standing in a black-and-white woodland, the only colour in the frame"
- ❌ "image", "logo.png", "photo of…"

One sentence is plenty.

---

## 7. Hide or feature

| Switch | What it does |
|---|---|
| **Hide from site** | The project (or photo) disappears everywhere: no page, no card, not in Google. Use it for work in progress, or to retire something without deleting it. Switch it off to bring it back. |
| **Feature on the home page** | Projects appear under "Selected work" on the home page; photos appear in the photography strip. With nothing featured, the first three projects and the first five photos are shown. Three projects and five photos look best. The row of work at the top of the home page shows the rest: projects and photos that aren't featured. |

**Prefer hiding to deleting.** A deleted project's address stops working, and anyone who saved or shared the link lands on the "page not found" page.

---

## 8. Photos

1. **Photos** → **New photo**.
2. **Title** (shown under the photo) and **Photo**: the finished, edited image.
3. **Original, before editing** (optional): adds a before/after slider in the full-screen view. Use the **same size and crop** as the finished photo.
4. **Describe the photo** (see [Images](#6-images)), plus an optional **Caption** and **Location**.
5. **Save** → **View Preview** → **Publish**.

Change the order with **Reorder Entries** on the Photos list.

---

## 9. Pages and settings

- **Home page**: the headline (two lines; the second is set in the accent colour), the introduction, and the titles and introductions of each home section.
- **Work page**: the page title and introduction, and the title and description of each filter.
- **About page**: portrait (a tall photo, shown at 4:5, at least 1200 px wide), statement, your story, and the closing line. The portrait also appears on the home page.
- **Contact page**: heading, introduction, the contact form's texts and the fortunes (at least three).
- **Photography page**: heading and introduction.
- **Site settings**:
  - **Site name**: the header, menu and footer draw the peachless. logo from it. Any other name shows there as plain text.
  - **Menu**: links start with `/` for a page on this site (e.g. `/projects/`) or `https://` for another site. **Show as a button** makes an item a pill, like Contact.
  - **Email addresses**: the first one is also offered when the contact form can't send.
  - **Social links**: Instagram, Behance, LinkedIn… They appear on the Contact page and in the footer.
  - **Footer invitation**: the "Let's create together." block at the bottom of every page.
  - **Search & sharing**: the default description for Google and the default image when the site is shared.

---

## 10. Please don't

- **Don't use "Save and Publish" for big changes.** Preview them first.
- **Don't delete projects.** Hide them instead (see [Hide or feature](#7-hide-or-feature)).
- **Don't skip image descriptions.** They're required for a reason: they make the site usable for everyone.
- **Don't upload text as pictures** where people need to read it. Write it in a Text section.
- **Don't link to pages that don't exist.** If a menu or button link is wrong, visitors hit "page not found".

---

## 11. Troubleshooting

| Problem | What to do |
|---|---|
| **"The preview couldn't be built."** | The live site is safe. Open the entry and look for red messages under the fields. If there are none, tell your developer which entry you changed. |
| **My change isn't live yet.** | Publishing takes about two minutes. Refresh the page. Check **Drafts**: if your change is there, it hasn't been published yet. |
| **I can't sign in.** | Accept the GitHub invitation (check your email), then try again. Still stuck? Ask your developer. |
| **An image looks blurry.** | Upload a bigger original (see the sizes above). |
| **Brand book pages show the wrong font.** | Re-export the pages from Illustrator with text converted to outlines, or as PNGs. |
| **I made a mistake and published it.** | Fix it and publish again. Nothing is ever lost: every published version is kept in the site's history, and your developer can restore any of them. |

---

## For the site administrator

### How "Sign In with GitHub" works

The button opens `https://auth.peachless.design`, a small Cloudflare Worker called `sveltia-cms-auth`. It was deployed from [sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) at commit `95733a9811`, and its source was reviewed first. It exchanges GitHub's one-time code for a sign-in token, and hands that token only to pages on `peachless.design`.

| Piece | Where it lives |
|---|---|
| Worker `sveltia-cms-auth`, custom domain `auth.peachless.design` | Cloudflare → **Workers & Pages** |
| `ALLOWED_DOMAINS` = `peachless.design` | the worker → **Settings → Variables and Secrets** |
| `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (both as secrets) | the same place; values come from the GitHub OAuth app |
| GitHub OAuth app **peachless. admin**: homepage `https://peachless.design`, callback `https://auth.peachless.design/callback` | GitHub → **Settings → Developer settings → OAuth Apps** |
| `base_url: https://auth.peachless.design` | `public/admin/config.yml` (a unit test requires it) |

Without `base_url`, the editor falls back to Netlify's sign-in service, and the popup says "Not Found".

### Giving someone access

1. In the GitHub repository go to **Settings → Collaborators → Add people**. Enter their GitHub username and choose the **Write** role.
2. They accept the emailed invitation, then sign in at https://peachless.design/admin/ with their own GitHub account.

Removing a collaborator removes their access.

### Housekeeping

- **Automatically delete head branches:** turn this on in repository **Settings → General → Pull Requests**. Each saved draft creates a branch, and this removes it once the draft is published.
- **Access tokens:** once GitHub sign-in works, revoke any personal access token that was used for the editor before (GitHub → **Settings → Developer settings → Personal access tokens**). "Sign In Using Access Token" still works as a fallback for developers.
- **Scope:** `backend.auth_scope` is `public_repo` because the repository is public. If the repository ever becomes private, change it to `repo`.

### Rotating the client secret

1. In the GitHub OAuth app, click **Generate a new client secret**.
2. Paste it into the worker's `GITHUB_CLIENT_SECRET` and deploy.
3. Delete the old secret on GitHub.

### Redeploying the worker

This is rarely needed: secrets and variables survive redeploys. Download `src/index.js` from the pinned commit (or a newer one you've reviewed) and put this `wrangler.toml` next to its `src` folder:

```toml
name = "sveltia-cms-auth"
main = "src/index.js"
compatibility_date = "2023-03-24"
workers_dev = false
keep_vars = true
routes = [{ pattern = "auth.peachless.design", custom_domain = true }]

[vars]
ALLOWED_DOMAINS = "peachless.design"
```

Then run `npx wrangler login` and `npx wrangler deploy`.
