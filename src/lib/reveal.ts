/**
 * One-shot scroll reveal for elements marked `data-reveal`. Elements already on
 * screen are revealed before the hiding class is added, so nothing above the
 * fold ever flashes; if this script never runs, everything simply stays
 * visible. The hiding/transition CSS lives in styles/motion.css and only
 * applies when the visitor allows motion.
 */
export function initReveal(root: ParentNode = document): void {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])'));
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => (el.dataset.revealed = ''));
    return;
  }

  const fold = window.innerHeight * 0.92;
  const pending = els.filter((el) => {
    const r = el.getBoundingClientRect();
    const visible = r.top < fold && r.bottom > 0;
    if (visible) el.dataset.revealed = '';
    return !visible;
  });

  document.documentElement.classList.add('reveal-on');
  if (!pending.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.revealed = '';
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.15 }
  );
  pending.forEach((el) => io.observe(el));
}
