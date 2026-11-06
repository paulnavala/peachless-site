/**
 * The canvas is the real built page in a sandboxed frame with no scripts. The
 * frame stays passive: WebKit won't deliver a parent's listeners to a frame
 * without allow-scripts, so we write to it, measure it and scroll it from out
 * here, and every pointer event lands on the overlay above it.
 *
 * Never add allow-scripts: content is rendered as HTML in here, and this sandbox
 * is what keeps it away from the sign-in token. tests/e2e/builder-frame.spec.ts
 * pins this, and a unit test checks the attribute.
 *
 * A frame shows one page and is then thrown away. A frame that navigates leaves a
 * dead document behind for anything still holding it, and doing this crashed WebKit
 * in testing however carefully the old document was let go of. A new frame can't.
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

/** A new frame. Its sandbox goes on here, once, before it has loaded anything. */
export function createFrame(title: string): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', FRAME_SANDBOX);
  frame.title = title;
  frame.tabIndex = -1;
  return frame;
}

/** Waits for a page by watching it: load events aren't reliable in WebKit here. */
export async function openPage(frame: HTMLIFrameElement, url: string, timeout = 20_000): Promise<Document> {
  const previous = frame.contentDocument;
  frame.src = url;
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const doc = frame.contentDocument;
    if (doc && doc !== previous && doc.readyState === 'complete') {
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
