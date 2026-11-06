# Editing peachless.design

This guide covers everything you need to update the site yourself: page layouts, new projects, photos and settings. You don't need to know any code.

There are two tools, and each has its own job:

| Tool | Address | Use it for |
|---|---|---|
| **The builder** | https://peachless.design/admin/builder/ | Your pages: what's on them, in what order, and every word. Laying out new pages. The story of a case study. |
| **The admin** | https://peachless.design/admin/ | Adding projects and photos, and site settings. |

Both use the same sign-in. They work best in Chrome, Edge or Safari on a computer.

---

## 1. Signing in

1. Open the builder or the admin.
2. Click **Sign in with GitHub**. The first time, GitHub asks you to approve "peachless. admin". Click **Authorize**.
3. You're in, for both tools. Next time it remembers you.

**The very first time:** you'll get an email from GitHub inviting you to the `peachless-site` repository. Accept it first. If the editor says *"You have a pending invitation"*, accept the invitation on GitHub, then sign in again.

---

## 2. The builder

The builder shows your real pages, with their real fonts, colours and pictures. What you change is what visitors will see.

| Where | What it's for |
|---|---|
| **Top bar** | The size to work at (**Desktop**, **Tablet**, **Phone**), **Undo** and **Redo**, then saving and publishing. |
| **Add** | Sections to add to this page. With a custom section selected, also the elements to put in it. |
| **Layers** | Everything on this page, in order. Move or hide things here, or click one to jump to it. |
| **Pages** | All your pages and case studies. This is also where you add a page and choose what's in the menu. |
| **Checks** | Anything that needs fixing before this page can go live. A number shows on the tab when something does. |
| **The right-hand panel** | Whatever you've selected: its words, background, spacing and position. |

### Editing a page

- **Click a section** to select it. It gets crop marks at its corners, and a toolbar: **Move** (drag it), **Up**, **Down**, **Duplicate**, **Hide**, **Delete**.
- **Double-click text** to change it right there. Press **Enter** to finish, or **Esc** to leave it as it was.
- **Hover over a section** and click **Add section** to put something new at that spot.
- **Changed your mind?** **Undo** steps back through everything you've done on this page (**Ctrl+Z**, or **⌘Z** on a Mac).

Some sections go on any page. Others only work on their own page, so they aren't offered elsewhere: the Hero, the About profile, the Contact form, the Fortune peach, the Photo gallery and the Work list.

### Custom sections

A custom section is your own layout, on the same 12 columns as the rest of the site.

1. Add a **Custom section**, then click it. The column guides appear.
2. In **Add**, pick an element: **Heading**, **Text**, **Image**, **Button**, **Quote** or **Divider**. It lands in the first free space.
3. Click an element to select it. **Drag** it to move it, and it snaps to the columns. **Drag a handle** to resize it. The small label shows its size in columns and rows.
4. Dropped it on something? Whatever was there moves down to make room, and comes back if you keep dragging.
5. For exact numbers, use **Column**, **Row**, **Width** and **Height** in the right-hand panel. The arrow keys nudge a selected element too.

Words never get cut off: if text needs more room, its row grows. An image fills exactly the space you give it, cropped to fit, or choose **Show it all**.

**On phones,** a custom section becomes one column, top to bottom and left to right, so check it with **Phone**. There you can hide an element or make it half width. Images and dividers can also move up or down the stack. Text stays in its reading order, so people using a keyboard or a screen reader hear it in the order you see it.

### Adding a page

1. **Pages** → type a name → **Add page**. Its address comes from the name, and can't be changed afterwards.
2. It starts with a title and a closing band, because every page needs both. Add what you like between them.
3. To put it in the menu, switch on **Show this page in the menu**. The menu holds six items.

Pages can't be deleted in the builder. To take one down, click an empty part of the canvas and switch on **Hide from site**. Switch it off to bring the page back.

The **Work** page is shared by every view of your work, so anything you add to it shows on UI/UX, Graphic design and each Made with page too.

### Case studies

Open one from **Pages**. You can edit the words of each block, change their order, and add **Text** and **Quote** blocks. Pictures, the title, the cover and the credits stay in the admin.

### What shows here, and what shows after publishing

The builder shows the site as it was last published, plus your changes. A few things only update once you publish: the row of work in the hero, project lists and counts, and the menu. **Preview** always shows you the real thing.

---

## 3. How changes go live

Nothing you do reaches visitors until you publish, and nothing is lost if you close the tab.

| What you see | What it means |
|---|---|
| **Unsaved changes, kept on this computer** | Your work is safe in this browser. Nobody else can see it yet. |
| **Save draft** | Saves your work and starts building a private preview. Do this when you're ready to check it, not after every change: each save starts a build. |
| **Building a preview…** | Usually a minute or two. After a quiet week it can take up to 10 minutes, because the site has to redo all its images. |
| **Preview** | Opens the private preview of the whole site, in a new tab. Check the page on your phone too. |
| **Publish** | Puts it on peachless.design. It's live about two minutes later. |
| **Discard draft** | Throws the draft away. The live site stays as it is. |

Your draft waits for you on any computer you sign in on. Work you haven't saved stays on the computer you did it on.

> **The live site is protected.** If a change can't be built, it simply doesn't go live. Visitors keep seeing the last working version.

> **If the site changes while you work** (say, you published something from the admin), the builder combines the two when you publish, then asks you to save again. If you both changed the very same thing, it tells you, and keeps yours.

### In the admin

Projects, photos and settings work a little differently:

| You want to… | Do this | Live after |
|---|---|---|
| Check a change first (recommended) | **Save** → **View Preview** → **Publish** | About 2 minutes after Publish |
| Fix a small typo | **Save and Publish** | About 2 minutes |
| Change the order of projects or photos | **Reorder Entries** → drag → **Done Reordering Entries** | About 2 minutes |

**Changed your mind?** **Discard Changes** brings back the version that's live. **Unfinished drafts** wait for you under **Drafts**.

---

## 4. Adding a project

1. **Projects** → **New project**.
2. Fill in the basics:
   - **Project name**: shown on the card, at the top of the page and in Google.
   - **One-line summary**: one sentence: what it is and who it's for.
   - **Type of work**: UI/UX, Graphic design, or both. This decides which Work filters show it.
   - **Year**, **Client or context** (a client's name, or "Concept project", "University coursework"…), **My role**: all optional, but they help tell the story. Employers look for your role.
   - **The challenge** and **The outcome**: one sentence each, shown near the top of the project page for readers who skim. Say what needed solving and what came of it, such as a test result or what you delivered. Leave them empty for a simple logo.
   - **Tools used**: tick everything you used. Each tool appears on the project page and adds the project to that tool's **Made with** filter on the Work page. A tool shows up in the filter as soon as one published project uses it, and disappears again when none do.
3. **The address.** When you create a project you also choose its web address, e.g. `peachless.design/projects/fish-seafood`. Use lowercase letters, numbers and dashes. **It can't be changed later**, because people may link to it, so pick something short and lasting.
4. **Cover image**: the picture on the Work page and at the top of the project page (see [Images](#6-images)). For a UI/UX project, show the screens rather than the logo: it's the first thing an employer sees. Use an image about 2400 × 1800 px, and keep what matters in the middle, because the top and bottom are cropped in some places.
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
| Cover | At least 2400 px wide (it fills the top of the project page) |
| Wide or full-width story images | At least 2000 px wide |
| Logos | Transparent PNG at least 2000 px wide, or SVG |
| Brand book pages | PNG about 2400 px wide, or SVG with outlined text |
| Phone screens (Device frame: Phone) | The screen only, no phone around it, exported at 2× (about 800 px wide) |
| Website screenshots (Device frame: Browser window) | The page only, no browser bar, about 2000 px wide |
| Share image (Search & sharing) | 1200 × 630 px |
| Photos | Any size: large uploads are resized automatically |

You don't need to shrink or compress anything: the site makes small, fast versions of every image for each screen size. File names don't matter either; they're tidied up automatically. Smaller originals look soft on sharp (retina) screens.

**Screenshots keep their top.** At the top of a project page, a cover set to **Fill the card** (and a prototype's preview image) is cropped from the bottom, so the top of the picture stays in view, like a browser window showing the top of a page. Put what matters near the top.

**Describe the image.** Every image has a short description for people who can't see it (screen readers) and for Google. Write what someone should know about the image:

- ✅ "The TON logo, a wordmark with a musical note rising from the O"
- ✅ "A red fox standing in a black-and-white woodland, the only colour in the frame"
- ❌ "image", "logo.png", "photo of…"

One sentence is plenty.

---

## 7. Hide, feature or shrink

| Switch | What it does |
|---|---|
| **Hide from site** | The project (or photo) disappears everywhere: no page, no card, not in Google. Use it for work in progress, or to retire something without deleting it. Switch it off to bring it back. |
| **Feature on the home page** | Projects appear under "Selected work" on the home page; photos appear in the photography strip. With nothing featured, the first three projects and the first five photos are shown. Three projects and five photos look best. The row of work at the top of the home page shows the rest: projects and photos that aren't featured. |
| **Show as a small tile** | For a single logo. On the Work page the project moves to the small tiles under the case studies, and it keeps its own page. Switch it off once it has grown into a full story. A lone tile joins the large cards, so tiles always come in twos or more. |

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

## 9. Settings

Page text lives in the builder. The admin keeps what the whole site shares.

- **Kinds of work**: the name and one line for UI/UX, Graphic design and Photography. Home's "What I do" and the Work filters both read them.
- **Site settings**:
  - **Site name**: the header, menu and footer draw the peachless. logo from it. Any other name shows there as plain text.
  - **Portrait**: a tall photo, shown at 4:5 on the About page and the home page, at least 1200 px wide.
  - **Menu**: links start with `/` for a page on this site (e.g. `/projects/`) or `https://` for another site. **Show as a button** makes an item a pill, like Contact. The builder can add a page to the menu too.
  - **Email addresses**: the first one is also offered when the contact form can't send.
  - **Social links**: Instagram, Behance, LinkedIn… They appear on the Contact page and in the footer.
  - **Your job title**: shown after your name in the browser tab on the home page and in Google.
  - **Résumé (PDF)**: one PDF, offered as a download on the About and Contact pages. To update it, upload the new file in the same place. **Before you upload:** anyone can download this file, and because the site's history is public, an old version can't be fully erased later. Leave out your phone number, home address and date of birth.
  - **Footer invitation**: the "Let's create together." block at the bottom of every page.
  - **Search & sharing**: the default description for Google and the default image when the site is shared.

---

## 10. Please don't

- **Don't use "Save and Publish" for big changes.** Preview them first.
- **Don't delete projects.** Hide them instead (see [Hide, feature or shrink](#7-hide-feature-or-shrink)).
- **Don't skip image descriptions.** They're required for a reason: they make the site usable for everyone.
- **Don't upload text as pictures** where people need to read it. Write it in a Text section.
- **Don't link to pages that don't exist.** If a menu or button link is wrong, visitors hit "page not found".

---

## 11. Troubleshooting

| Problem | What to do |
|---|---|
| **"The preview couldn't be built."** | The live site is safe, and so is your draft. In the builder, press **Copy details** and send that to your developer. In the admin, open the entry and look for red messages under the fields. |
| **The builder won't save, and shows a list.** | Those are the things to fix first. Click one to go to it. |
| **"This account can look but can't save."** | Your GitHub account needs access to the site. Ask your developer. |
| **"The builder is open in another tab."** | Use that tab, so two tabs can't overwrite each other. Or close it and reload this one. |
| **"The automatic checks found a problem."** | The preview built, so the site works, but a test noticed something. Have a look, or ask your developer. Press **Publish** twice to go ahead anyway. |
| **My change isn't live yet.** | Publishing takes about two minutes, or up to 10 after a quiet week. Refresh the page. Check **Drafts**: if your change is there, it hasn't been published yet. |
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
2. They accept the emailed invitation, then sign in at https://peachless.design/admin/ or https://peachless.design/admin/builder/ with their own GitHub account.

Without the **Write** role the builder opens, but says the account can't save.

Removing a collaborator removes their access.

### How the builder saves

The builder runs in the browser, with the same token as the admin, and talks only to GitHub. A save commits to the branch `builder/draft` and opens a draft pull request, which gives a preview at https://builder-draft.peachless.pages.dev. Publish squash-merges it once the `Cloudflare Pages` check has passed. A failed `build-test` run warns, and takes a second press of Publish, so a flaky test can't strand an editor. A failed preview blocks publishing.

Sign-in only works on peachless.design, because the worker refuses other hosts. On a preview deployment the builder opens in a demo that can't save. To try the real thing there, sign in at `/admin/` with an access token first: the builder picks it up.

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
