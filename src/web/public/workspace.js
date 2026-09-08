// Presentation only: never writes server settings or rebuilds form controls.
(() => {
  try { localStorage.removeItem('dexzu-dashboard-layout'); } catch { /* Optional preference cleanup. */ }
  const menu = document.getElementById('mobile-navigation');
  const navigation = document.getElementById('dashboard-navigation');
  const mobile = matchMedia('(max-width: 760px)');
  function closeMenu(returnFocus = false) {
    document.body.classList.remove('navigation-open');
    menu.setAttribute('aria-expanded', 'false');
    if (returnFocus) menu.focus();
  }
  function markCurrent() {
    navigation.querySelectorAll('[data-page]').forEach(button => {
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }
  menu.addEventListener('click', () => {
    const open = document.body.classList.toggle('navigation-open');
    menu.setAttribute('aria-expanded', String(open));
    if (open) navigation.querySelector('.active')?.focus();
  });
  navigation.addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (!button?.classList.contains('active')) return;
    markCurrent();
    if (mobile.matches) { closeMenu(); document.getElementById('dashboard-main').focus({ preventScroll: true }); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('navigation-open')) closeMenu(true);
  });
  mobile.addEventListener('change', () => closeMenu());
  markCurrent();
  document.getElementById('refresh-dashboard').innerHTML = icon('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/>');
  const navigationIcons = { overview: icons.chart, safety: icons.shield, greetings: icons.members,
    leveling: icons.trend, logging: icons.command, youtube: icon('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>'),
    operations: icons.shield, 'module-counting': icons.hash, 'module-economy': icons.wallet,
    'module-moderation': icons.shield, 'module-ticket': icons.ticket, 'module-serverstats': icons.chart };
  navigation.querySelectorAll('[data-page]').forEach(button => {
    button.querySelector('.nav-icon').innerHTML = navigationIcons[button.dataset.page];
  });
  const labels = { 'promo-enabled': 'Enable promotion filter', 'spam-enabled': 'Enable spam protection',
    'mentions-enabled': 'Enable mention limit', 'greeting-cards': 'Enable greeting cards',
    'welcome-enabled': 'Enable welcome messages', 'goodbye-enabled': 'Enable goodbye messages',
    'leveling-enabled': 'Enable leveling', 'leveling-announce': 'Enable level-up announcements',
    'logging-enabled': 'Enable server logging', 'logging-search': 'Search recorded events' };
  Object.entries(labels).forEach(([id, label]) => document.getElementById(id)?.setAttribute('aria-label', label));
})();
