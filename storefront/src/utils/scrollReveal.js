/**
 * Scroll-in animation for storefront sections and cards.
 *
 * Elements with the `sf-reveal` class fade and rise into place the first time they
 * scroll into view. Hidden-until-revealed styles only apply once `sf-motion` is on
 * <html>, which this module adds after the observer is running, so content is never
 * stuck invisible if JavaScript or IntersectionObserver is unavailable.
 */
const REVEAL_SELECTOR = '.sf-reveal:not(.is-visible)';

export const startScrollReveal = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  const observeWithin = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches?.(REVEAL_SELECTOR)) observer.observe(root);
    root.querySelectorAll?.(REVEAL_SELECTOR).forEach((node) => observer.observe(node));
  };

  document.documentElement.classList.add('sf-motion');
  observeWithin(document.body);

  // Lists render after data loads and routes swap content; catch new elements as they mount.
  // Added nodes are batched and scanned once per animation frame, so a big render (or many
  // small ones) costs a single pass instead of one query per inserted element.
  let pending = [];
  let frame = 0;
  const flush = () => {
    frame = 0;
    const roots = pending;
    pending = [];
    // Many inserts in one frame (a page or list render): one scan of the page is cheaper.
    if (roots.length > 20) {
      observeWithin(document.body);
      return;
    }
    roots.forEach((node) => {
      if (node.isConnected) observeWithin(node);
    });
  };
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) pending.push(node);
      });
    });
    if (pending.length && !frame) frame = window.requestAnimationFrame(flush);
  }).observe(document.body, { childList: true, subtree: true });
};
