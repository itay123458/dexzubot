(() => {
  const root = $('beta-embed-motion'), form = $('embed-motion-form'), input = $('embed-motion-enabled');
  const status = $('embed-motion-status'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let saved, busy = false;
  root.hidden = false;
  function preview() {
    const moving = input.checked && !reduced.matches && !document.hidden;
    for (const kind of ['avatar', 'banner']) {
      const asset = kind === 'banner' ? 'giveaway' : dashboardWorkspace === 'beta' ? 'avatar' : 'avatar-main';
      $( `embed-motion-${kind}` ).src = `/dashboard/assets/embed-motion/dexzu-motion-${asset}.${moving ? 'gif' : 'png'}`;
    }
  }
  const report = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
  input.addEventListener('change', () => { setDirty('operations', input.checked !== saved?.enabled, 'embed-motion'); preview(); });
  reduced.addEventListener('change', preview);
  document.addEventListener('visibilitychange', preview);
  window.addEventListener('dexzu-discard', event => {
    if (event.detail !== 'operations' || busy) return;
    input.checked = saved?.enabled === true; setDirty('operations', false, 'embed-motion'); preview();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !saved?.ready) return;
    busy = true; form.querySelector('fieldset').disabled = true; report('Saving and updating panels…');
    try {
      saved = await post('embed-motion', { enabled: input.checked });
      input.checked = saved.enabled; setDirty('operations', false, 'embed-motion'); preview();
      const partial = saved.panels?.errors > 0;
      report(partial ? 'Design saved. Some panels could not be updated; save again to retry.' : 'Message design saved. New replies and configured panels use this setting.', partial);
      toast(partial ? 'Some panels need another try' : 'Message design saved', partial ? 'warning' : false);
    } catch (error) { report(error.message, true); }
    finally { busy = false; form.querySelector('fieldset').disabled = !saved?.ready; }
  });
  preview();
  void (async () => {
    try {
      const response = await fetch(dashboardApiUrl('embed-motion'), { cache: 'no-store' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load message design.');
      saved = data; input.checked = data.enabled; form.querySelector('fieldset').disabled = !data.ready; preview();
      report(data.ready ? 'Applies to this workspace only. Discord controls GIF playback.' : 'Message artwork is waiting to be installed.');
    } catch (error) { report(error.message, true); }
  })();
})();
