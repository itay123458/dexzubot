/* Shared dashboard motion. Content stays visible when motion or JS is unavailable. */
(() => {
  'use strict';
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const styles = getComputedStyle(document.documentElement);
  const duration = (name, fallback) => parseFloat(styles.getPropertyValue(`--motion-${name}`)) || fallback;
  const timing = { interaction: duration('interaction', 150), panel: duration('panel', 240), count: duration('count', 450), stagger: duration('stagger', 50) };
  const selector = '.control-header, .topbar, .bot-banner, .metric, .card, #control-search-results > button';
  const entered = new WeakSet();
  const pending = new Map();
  const counters = new Map();
  const animations = new Map();
  const closing = new Map();
  let intersection;
  let mutations;
  let running = false;
  const paused = () => preference.matches || document.hidden || !running;
  const eligible = element => element.isConnected && !element.closest('.page:not(.active)') && !element.closest('[hidden]');

  function enter(element, order = 0) {
    pending.delete(element);
    intersection?.unobserve(element);
    if (!eligible(element) || entered.has(element)) return;
    entered.add(element);
    if (paused()) return;
    element.style.setProperty('--motion-delay', `${Math.min(order * timing.stagger, 200)}ms`);
    element.classList.add('motion-enter');
  }

  function discover(root, startingOrder = 0) {
    if (!(root instanceof Element) || !running || !eligible(root)) return startingOrder;
    const candidates = [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
    let order = startingOrder;
    for (const element of candidates) {
      if (!eligible(element) || entered.has(element) || pending.has(element) || element.classList.contains('skeleton')) continue;
      // Animate the outer card only, so nested cards/metrics do not move twice.
      if (element.parentElement?.closest(selector)) continue;
      const delay = order++;
      if (paused() || !intersection) enter(element, delay);
      else { pending.set(element, delay); intersection.observe(element); }
    }
    return order;
  }

  function cancelCount(element, finish = false) {
    const active = counters.get(element);
    if (!active) return;
    cancelAnimationFrame(active.frame);
    counters.delete(element);
    if (finish && element.isConnected) element.textContent = active.final;
  }

  function count(element, from, to, duration = timing.count) {
    if (!element) return;
    cancelCount(element);
    if (!element.isConnected) return;
    const final = to === null || to === undefined ? '—' : String(to);
    const numeric = value => typeof value === 'number' && Number.isFinite(value);
    if (paused() || !numeric(from) || !numeric(to) || from === to || !(duration > 0)) {
      element.textContent = final;
      return;
    }
    const active = { frame: 0, final };
    const start = performance.now();
    counters.set(element, active);
    const tick = now => {
      if (counters.get(element) !== active) return;
      if (!element.isConnected) { counters.delete(element); return; }
      const progress = Math.min(1, Math.max(0, (now - start) / Math.min(duration, 600)));
      const value = from + (to - from) * (1 - (1 - progress) ** 3);
      element.textContent = progress === 1 ? final : String(Math.round(value));
      if (progress < 1) active.frame = requestAnimationFrame(tick);
      else counters.delete(element);
    };
    active.frame = requestAnimationFrame(tick);
  }

  function animate(element, keyframes, options = {}) {
    animations.get(element)?.cancel();
    animations.delete(element);
    if (!element?.isConnected || paused() || typeof element.animate !== 'function') return null;
    const animation = element.animate(keyframes, { duration: timing.interaction, easing: styles.getPropertyValue('--motion-ease').trim() || 'ease-out', ...options });
    animations.set(element, animation);
    const cleanup = () => { if (animations.get(element) === animation) animations.delete(element); };
    animation.finished.then(cleanup, cleanup);
    return animation;
  }

  function cancelDialogClose(dialog) {
    const token = closing.get(dialog);
    if (!token) return;
    closing.delete(dialog);
    token.animation?.cancel();
    dialog.classList.remove('motion-closing');
  }

  async function closeDialog(dialog) {
    if (!dialog?.open) return false;
    cancelDialogClose(dialog);
    const token = {};
    closing.set(dialog, token);
    dialog.classList.add('motion-closing');
    token.animation = animate(dialog, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(6px) scale(.985)' }], { duration: timing.panel });
    if (token.animation) {
      try { await token.animation.finished; }
      catch { if (closing.get(dialog) === token) cancelDialogClose(dialog); return false; }
    }
    if (closing.get(dialog) !== token) return false;
    closing.delete(dialog);
    dialog.classList.remove('motion-closing');
    if (!dialog.isConnected || !dialog.open) return false;
    dialog.close();
    return true;
  }

  function pageChanged(panel = document.querySelector('.page.active')) {
    for (const [element] of pending) {
      if (!eligible(element)) { intersection?.unobserve(element); pending.delete(element); }
    }
    for (const [element] of counters) if (!eligible(element)) cancelCount(element, true);
    if (panel) {
      const newCards = [...panel.querySelectorAll(selector)].some(element => eligible(element) && !entered.has(element) && !element.classList.contains('skeleton') && !element.parentElement?.closest(selector));
      discover(panel);
      if (!newCards) animate(panel, [{ opacity: .65, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: timing.panel });
    }
  }
  const onPage = event => pageChanged(event.detail?.panel instanceof Element ? event.detail.panel : undefined);
  function clearEntrance(element) {
    element.classList.remove('motion-enter');
    element.style.removeProperty('--motion-delay');
  }
  const onAnimationEnd = event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.classList.contains('motion-enter')) clearEntrance(event.target);
    event.target.classList.remove('activity-new', 'status-value-updated');
  };
  function onVisibility() {
    document.body?.classList.toggle('motion-paused', paused());
    if (paused()) {
      document.querySelectorAll('.motion-enter').forEach(clearEntrance);
      document.querySelectorAll('.activity-new, .status-value-updated').forEach(element => element.classList.remove('activity-new', 'status-value-updated'));
      for (const [element] of counters) cancelCount(element, true);
      for (const animation of animations.values()) {
        try { animation.finish(); } catch { animation.cancel(); }
      }
    }
  }
  function start() {
    if (running || !document.body) return;
    running = true;
    if ('IntersectionObserver' in window) intersection = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) enter(entry.target, pending.get(entry.target) || 0);
    }, { threshold: 0.08 });
    mutations = new MutationObserver(records => {
      let changedElements = false;
      let order = 0;
      for (const record of records) {
        for (const node of record.addedNodes) if (node instanceof Element) { changedElements = true; order = discover(node, order); }
        if ([...record.removedNodes].some(node => node instanceof Element)) changedElements = true;
      }
      if (!changedElements) return;
      // Drop detached nodes held by active observers or animations.
      for (const [element] of pending) if (!element.isConnected) { intersection?.unobserve(element); pending.delete(element); }
      for (const [element] of counters) if (!element.isConnected) cancelCount(element);
      for (const [element, animation] of animations) if (!element.isConnected) { animation.cancel(); animations.delete(element); }
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('dexzu-page', onPage);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('animationend', onAnimationEnd);
    preference.addEventListener('change', onVisibility);
    onVisibility();
    discover(document.body);
  }
  function stop() {
    running = false;
    intersection?.disconnect();
    mutations?.disconnect();
    pending.clear();
    for (const [element] of counters) cancelCount(element, true);
    for (const [dialog] of closing) cancelDialogClose(dialog);
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    window.removeEventListener('dexzu-page', onPage);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('animationend', onAnimationEnd);
    preference.removeEventListener('change', onVisibility);
    document.body?.classList.add('motion-paused');
    document.querySelectorAll('.motion-enter').forEach(clearEntrance);
  }

  window.DexzuMotion = Object.freeze({ pageChanged, reveal: discover, count, animate, closeDialog, cancelDialogClose });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
