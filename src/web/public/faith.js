(() => {
  if (dashboardWorkspace !== 'beta') return;
  $('faith-nav').hidden = false;
  $('faith-controls').hidden = false;
  $('faith-scope').textContent = 'Beta first · each server keeps its own settings.';
  const form = $('faith-form'), fields = $('faith-fields');
  let data, dirty = false, busy = false;
  const status = (message, error = false) => {
    $('faith-status').textContent = message;
    $('faith-status').dataset.error = String(error);
  };
  const markDirty = value => { dirty = value; setDirty('faith', value); };
  function render() {
    const config = data.config;
    $('faith-enabled').checked = config.enabled;
    for (const [id, value] of [['faith-channel', config.channelId], ['faith-discussion', config.discussionChannelId]]) {
      const select = $(id);
      select.replaceChildren(new Option('Not configured', ''), ...data.channels.map(channel => new Option(`#${channel.name}`, channel.id)));
      if (value && !data.channels.some(channel => channel.id === value)) select.add(new Option('Unavailable channel — choose another', value));
      select.value = value || '';
    }
    $('faith-time').value = config.time;
    $('faith-timezone').value = config.timezone;
    $('faith-translation').value = config.translation;
    $('faith-verse').textContent = data.verse.text;
    $('faith-reference').textContent = data.verse.reference;
    $('faith-source').href = data.verse.source;
    $('faith-preview-date').textContent = `${data.today} · ${config.time} (${config.timezone})`;
    $('faith-collection').textContent = `${data.collectionSize} verified verses rotate daily. English / World English Bible is the supported translation in this Beta release.`;
    $('faith-delivery-error').textContent = data.delivery.lastError || 'No delivery errors recorded.';
    const history = $('faith-history'); history.replaceChildren();
    for (const entry of [...data.delivery.entries].reverse().slice(0, 10)) {
      const row = document.createElement('li');
      row.textContent = `${entry.date} · ${entry.status === 'sent' ? 'Posted' : 'Pending — will check Discord before retrying'}`;
      if (entry.messageId) {
        const link = document.createElement('a'); link.textContent = 'Open post';
        link.href = `https://discord.com/channels/${state?.server?.id || ''}/${entry.channelId}/${entry.messageId}`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(' · ', link);
      }
      history.append(row);
    }
    if (!history.children.length) { const row = document.createElement('li'); row.textContent = 'No daily verses posted yet.'; history.append(row); }
  }
  async function load() {
    if (busy) return;
    busy = true; fields.disabled = true; form.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(dashboardApiUrl('faith'), { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Faith settings could not be loaded.');
      data = result; render(); markDirty(false); status('Settings loaded.');
      return true;
    } catch (error) { status(error.message, true); }
    finally { busy = false; fields.disabled = !data; form.removeAttribute('aria-busy'); }
  }
  form.addEventListener('input', () => { markDirty(true); status('Unsaved changes.'); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !data) return;
    busy = true; fields.disabled = true; form.setAttribute('aria-busy', 'true'); status('Saving…');
    try {
      await post('faith', { enabled: $('faith-enabled').checked, channelId: $('faith-channel').value || null,
        discussionChannelId: $('faith-discussion').value || null, time: $('faith-time').value,
        timezone: $('faith-timezone').value.trim(), translation: $('faith-translation').value });
      markDirty(false); busy = false;
      if (await load()) status('Faith settings saved.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; fields.disabled = false; form.removeAttribute('aria-busy'); }
  });
  $('faith-refresh').addEventListener('click', () => {
    if (dirty && !confirm('Discard unsaved Faith settings and refresh?')) return;
    void load();
  });
  window.addEventListener('dexzu-discard', event => { if (event.detail === 'faith') { markDirty(false); if (data) render(); } });
  window.addEventListener('dexzu-page', event => { if (event.detail.panel?.dataset.panel === 'faith' && !dirty) void load(); });
  void load();
})();
