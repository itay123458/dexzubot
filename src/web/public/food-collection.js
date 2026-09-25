(() => {
  if (!['main', 'beta'].includes(dashboardWorkspace)) return;
  const root = $('food-collection-controls'), form = $('food-settings-form'), fields = $('food-settings-fields');
  root.hidden = false;
  let data, dirty = false, busy = false;
  const status = (message, error = false) => { $('food-settings-status').textContent = message; $('food-settings-status').dataset.error = String(error); };
  const markDirty = value => { dirty = value; setDirty('operations', value, 'food-collection'); };
  function render() {
    $('food-enabled').checked = data.settings.enabled;
    $('food-cooldown').value = data.settings.cooldownSeconds;
    $('food-rarities').replaceChildren(...data.rarities.map(rarity => {
      const item = document.createElement('p'), label = document.createElement('strong'), detail = document.createElement('span');
      label.textContent = `${rarity.label} · ${rarity.chance}%`; detail.textContent = `${rarity.foods} foods`;
      item.append(label, detail); return item;
    }));
  }
  async function load() {
    if (busy || dirty) return;
    busy = true; fields.disabled = true;
    try {
      const response = await fetch(dashboardApiUrl('food'), { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Food settings could not be loaded.');
      data = result; render(); status('Settings loaded.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; fields.disabled = !data; }
  }
  form.addEventListener('input', () => { markDirty(true); status('Unsaved food settings.'); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !data) return;
    busy = true; fields.disabled = true; form.setAttribute('aria-busy', 'true'); status('Saving…');
    try {
      const result = await post('food', { enabled: $('food-enabled').checked, cooldownSeconds: Number($('food-cooldown').value) });
      data.settings = result.settings; render(); markDirty(false); status('Food settings saved.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; fields.disabled = false; form.removeAttribute('aria-busy'); }
  });
  window.addEventListener('dexzu-discard', event => { if (event.detail === 'operations') { markDirty(false); if (data) render(); } });
  window.addEventListener('dexzu-page', event => { if (event.detail.panel?.dataset.panel === 'operations') void load(); });
  void load();
})();
