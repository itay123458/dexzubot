// Shares the existing dashboard transport and persisted guild settings.
(() => {
  const form = $('prefix-settings-form');
  let dirty = false;
  const renderPrefix = current => {
    if (dirty || !current?.prefixSettings) return;
    const settings = current.prefixSettings;
    $('prefix-enabled').checked = settings.enabled;
    $('command-prefix').value = settings.prefix;
    $('prefix-help-text').textContent = `Use 1–10 characters without spaces or quotes. Help: ${settings.prefix}help · Settings: ${settings.prefix}config or /prefix.`;
    $('prefix-channel-list').innerHTML = current.channels.map(channel => checkbox(channel.id, `# ${escapeHtml(channel.name)}`, settings.allowedChannelIds.includes(channel.id), 'prefix-channel')).join('');
    $('prefix-role-list').innerHTML = current.accessRoles.map(role => checkbox(role.id, escapeHtml(role.name), settings.allowedRoleIds.includes(role.id), 'prefix-role')).join('');
  };
  form.addEventListener('input', () => { dirty = true; setDirty('operations', true); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const selected = group => [...form.querySelectorAll(`[data-group="${group}"]:checked`)].map(input => input.value);
    const input = { prefix: $('command-prefix').value, enabled: $('prefix-enabled').checked, allowedChannelIds: selected('prefix-channel'), allowedRoleIds: selected('prefix-role') };
    if (input.allowedChannelIds.length > 25 || input.allowedRoleIds.length > 25) { toast('Choose up to 25 channels and 25 roles.', true); return; }
    $('prefix-settings-fields').disabled = true;
    try {
      const result = await post('prefix', input);
      state.prefixSettings = result.settings;
      dirty = false; setDirty('operations', false); renderPrefix(state);
      toast('Prefix settings saved', false, 'Discord and the website now use the same settings.');
    } catch (error) { toast('Could not save prefix settings', true, error.message); }
    finally { $('prefix-settings-fields').disabled = false; }
  });
  window.addEventListener('dexzu-state', event => renderPrefix(event.detail));
  window.addEventListener('dexzu-discard', event => {
    if (event.detail !== 'operations') return;
    dirty = false; setDirty('operations', false); renderPrefix(state);
  });
  const refreshPrefix = async () => {
    if (dirty || document.hidden || !state || !document.querySelector('[data-panel="operations"]').classList.contains('active')) return;
    try {
      const response = await fetch('/dashboard/api/prefix', { cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      if (dirty) return;
      state.prefixSettings = result.settings; renderPrefix(state);
    } catch { /* Keep the last loaded values; save errors remain visible. */ }
  };
  let timer;
  const startPolling = () => { clearInterval(timer); timer = setInterval(refreshPrefix, 30000); };
  startPolling();
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', startPolling);
  window.addEventListener('focus', refreshPrefix);
  if (state) renderPrefix(state);
})();
