(() => {
  const key = 'dexzu-dashboard-layout';
  const layouts = new Set(['classic', 'compact', 'topnav', 'studio', 'focus', 'command']);
  const picker = document.getElementById('dashboard-layout');
  const hint = document.getElementById('layout-hint');
  if (!picker) return;
  const choices = [...document.querySelectorAll('[data-layout-choice]')];

  function apply(value) {
    const layout = layouts.has(value) ? value : 'classic';
    document.body.dataset.layout = layout;
    picker.value = layout;
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layoutChoice === layout)));
    // Reposition the existing navigation highlight without rerendering forms.
    window.dispatchEvent(new Event('resize'));
  }

  try { apply(localStorage.getItem(key)); }
  catch { apply('classic'); hint.textContent = 'Browser storage unavailable'; }

  function choose(value) {
    apply(value);
    try {
      localStorage.setItem(key, picker.value);
      hint.textContent = 'Saved on this browser';
    } catch {
      hint.textContent = 'Applied for this visit only';
    }
  }
  picker.addEventListener('change', () => choose(picker.value));
  choices.forEach(button => button.addEventListener('click', () => choose(button.dataset.layoutChoice)));
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
