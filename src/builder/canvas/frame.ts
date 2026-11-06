/**
 * The canvas is the real built page in a sandboxed frame with no scripts. The
 * frame stays passive: WebKit won't deliver a parent's listeners to a frame
 * without allow-scripts, so we write to it, measure it and scroll it from out
 * here, and every pointer event lands on the overlay above it.
 *
 * Never add allow-scripts: content is rendered as HTML in here, and this sandbox
 * is what keeps it away from the sign-in token. tests/e2e/builder-frame.spec.ts
 * pins this, and a unit test checks the attribute.
 */
export const FRAME_SANDBOX = 'allow-same-origin';

/**
 * Stills the page, so an editor sees final states. :is() takes its strongest
 * argument's specificity, which outranks every rule on the site without
 * !important. The scrollbar goes because the parent scrolls, and because
 * reset.css reserves a gutter that would narrow a 390 view on Windows. The header
 * scrolls away with the page: its background comes from a script that can't run
 * here, so stuck in place it would sit see-through over the content.
 */
const STILL = `
  html { scrollbar-width: none; scrollbar-gutter: auto; }
  html::-webkit-scrollbar { display: none; }
  :is(#canvas-still, *), :is(#canvas-still, *)::before, :is(#canvas-still, *)::after {
    animation: none; transition: none; scroll-behavior: auto;
  }
  :is(#canvas-still, .site-header) { position: relative; }`;

/** Waits for a page by watching it: load events aren't reliable in WebKit here. */
export async function openPage(frame: HTMLIFrameElement, url: string, timeout = 20_000): Promise<Document> {
  frame.setAttribute('sandbox', FRAME_SANDBOX);
  frame.src = url;
  const wanted = new URL(url, location.href).pathname;
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const doc = frame.contentDocument;
    if (doc && doc.readyState === 'complete' && new URL(doc.URL, location.href).pathname === wanted) {
      still(doc);
      return doc;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`The page ${url} didn’t load.`);
}

function still(doc: Document): void {
  if (doc.getElementById('canvas-still-sheet')) return;
  const style = doc.createElement('style');
  style.id = 'canvas-still-sheet';
  style.textContent = STILL;
  doc.head.append(style);
}

/** A page that exists has been built; a new one needs the shell until it is. */
export async function pageExists(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: 'HEAD' })).ok;
  } catch {
    return false;
  }
}
