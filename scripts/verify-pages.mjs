import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';

const PORT = Number(process.env.VERIFY_PORT) || 8789;
const BASE = `http://localhost:${PORT}`;

// For each route, list DOM selectors that MUST be present after the page settles.
// Selectors target either inlined markup (e.g. `#portfolio-uiux`) or the
// mount-point pattern (`[data-component="..."]`) that the runtime fetcher attaches to.
const ROUTES = [
  { path: '/',                       key: 'home',         selectors: ['.twin-gallery', '.guidelines-wrapper', '[data-component="fortune-peach"]'] },
  { path: '/about/',                 key: 'about',        selectors: ['.about-page', '.about-photo img'] },
  { path: '/contact/',               key: 'contact',      selectors: ['.contact-page', 'a[href^="mailto:"]'] },
  { path: '/projects/',              key: 'projects',     selectors: ['[data-component="project-cards"]'] },
  { path: '/uiux/',                  key: 'uiux',         selectors: ['#portfolio-uiux', '#projects-data'] },
  { path: '/photography/',           key: 'photography',  selectors: ['#portfolio-photo'] },
  { path: '/projects/logo-design/',  key: 'logo-design',  selectors: ['[data-component="logo-showcase"]'] },
  { path: '/projects/guidelines/',   key: 'guidelines',   selectors: ['[data-component="guideline-page"]'] }
];

const IGNORED_CONSOLE_PATTERNS = [
  /favicon/i,
  /MMX.*No mobile toggle/i,
  // Figma's own iframe scripts (statsig analytics, ruleset fetches) noise inside embedded prototypes
  /figma\.com/i,
  /statsig/i,
  /Failed to fetch v1 ruleset/i,
  /401/
];
const IGNORED_REQUEST_PATTERNS = [
  /favicon/i,
  // Figma prototype embeds abort their own analytics/proto polls when loaded headlessly
  /figma\.com/i
];

mkdirSync('screenshots', { recursive: true });

// Spawn `npx serve` on a fixed port
const server = spawn('npx', ['--yes', 'serve@14', '.', '-l', String(PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32'
});

server.stdout.on('data', () => {});
server.stderr.on('data', (c) => process.stderr.write(c));

// Poll the server until it responds. Spawning `npx --yes serve@14` on a fresh
// system can take 5-15s (resolve, possibly download, then bind). A fixed grace
// period is unreliable; an actual HTTP probe is.
async function waitForServer(url, totalMs = 30000, intervalMs = 250) {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok || res.status < 500) return;
    } catch {}
    await wait(intervalMs);
  }
  throw new Error(`server did not respond at ${url} within ${totalMs}ms`);
}
await waitForServer(BASE + '/');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

const results = [];

for (const route of ROUTES) {
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const txt = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(txt))) return;
    consoleErrors.push(txt);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (IGNORED_REQUEST_PATTERNS.some((re) => re.test(url))) return;
    failedRequests.push(`${url} :: ${req.failure()?.errorText}`);
  });

  // 'load' (not 'networkidle') — Figma iframes on /uiux/ poll their analytics
  // endpoints forever, so the page never reaches network-idle. We give an
  // explicit settle wait below for components to mount their fetched data.
  await page.goto(BASE + route.path, { waitUntil: 'load', timeout: 30000 });

  // Give components time to fetch their data JSON and mount
  await wait(2500);

  // Body data-page (proves the correct shell was rendered)
  const dataPage = await page.getAttribute('body', 'data-page');
  const dataPageOK = dataPage === route.key;

  // Required selectors
  const selectorResults = [];
  for (const sel of route.selectors) {
    const el = await page.$(sel);
    selectorResults.push({ selector: sel, found: !!el });
  }

  // Header text
  const logoText = (await page.textContent('.site-header__logo'))?.trim();

  // Screenshot
  await page.screenshot({ path: `screenshots/${route.key}.png`, fullPage: true });

  results.push({
    path: route.path,
    key: route.key,
    dataPageOK,
    logoOK: logoText === 'peachless.',
    consoleErrors,
    failedRequests,
    selectorResults
  });

  await page.close();
}

await browser.close();

// Tree-kill the server. server.kill() only signals the immediate child
// (cmd.exe wrapper on Windows when spawn used shell:true), so the actual
// `node serve@14` grandchild leaks and pins the event loop open.
function killTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    // Use spawnSync so taskkill actually finishes before we exit; otherwise
    // process.exit(0) tears down the script before the kill is dispatched
    // and the `node serve@14` grandchild keeps the port bound.
    try {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  }
  try { child.kill('SIGKILL'); } catch {}
}
killTree(server);

console.log(JSON.stringify(results, null, 2));

const failing = results.filter((r) =>
  !r.dataPageOK ||
  !r.logoOK ||
  r.consoleErrors.length > 0 ||
  r.failedRequests.length > 0 ||
  r.selectorResults.some((s) => !s.found)
);
if (failing.length) {
  console.error(`\n${failing.length} page(s) failed verification.`);
  process.exit(1);
}
console.log('\nAll pages verified.');
process.exit(0);
