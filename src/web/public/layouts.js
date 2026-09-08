(() => {
  const key = 'dexzu-dashboard-layout';
  const layouts = new Set(['classic', 'compact', 'topnav']);
  const picker = document.getElementById('dashboard-layout');
  const hint = document.getElementById('layout-hint');
  if (!picker) return;

  function apply(value) {
    const layout = layouts.has(value) ? value : 'classic';
    document.body.dataset.layout = layout;
    picker.value = layout;
    // Reposition the existing navigation highlight without rerendering forms.
    window.dispatchEvent(new Event('resize'));
  }

  try { apply(localStorage.getItem(key)); }
  catch { apply('classic'); hint.textContent = 'Browser storage unavailable'; }

  picker.addEventListener('change', () => {
    apply(picker.value);
    try {
      localStorage.setItem(key, picker.value);
      hint.textContent = 'Saved on this browser';
    } catch {
      hint.textContent = 'Applied for this visit only';
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
