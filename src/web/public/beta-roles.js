(() => {
  if (dashboardWorkspace !== 'beta') return;
  const controls = $('beta-role-controls'), releaseCard = $('beta-release-notes');
  controls.hidden = false; releaseCard.hidden = false;
  $('open-beta-roles').addEventListener('click', () => showPage('operations'));
  const forms = [...controls.querySelectorAll('form')], drafts = new Set();
  const dialog = $('role-preview-dialog');
  let roleData, busy = false, preview = null, refreshing = false, editingRoleId = '';
  const dirty = (form, value) => {
    if (value) drafts.add(form.id); else drafts.delete(form.id);
    setDirty('operations', value, `roles:${form.id}`);
  };
  forms.forEach(form => form.addEventListener('input', () => dirty(form, true)));
  const plain = text => String(text).replace(/<@&(\d+)>/g, (_, id) => roleData?.roles.find(role => role.id === id)?.name || `role ${id}`)
    .replace(/<@(\d+)>/g, (_, id) => `member ${id}`).replace(/\*\*|`/g, '').replace(/\\([_*~])/g, '$1');
  const status = (message, error = false) => {
    $('role-status').textContent = plain(message); $('role-status').dataset.error = String(error);
  };
  function setBusy(value) {
    busy = value;
    controls.setAttribute('aria-busy', String(value));
    for (const form of forms) form.querySelector('fieldset').disabled = value || !roleData;
    const selected = roleData?.roles.find(role => role.id === $('role-edit-selected').value);
    $('role-edit-form').querySelector('fieldset').disabled = value || !selected?.manageable;
    $('role-edit-selected').disabled = value;
    $('refresh-roles').disabled = value || refreshing;
    $('role-confirm').disabled = value; $('role-cancel').disabled = value;
    if (!value && dialog.open && document.activeElement === dialog) $('role-cancel').focus();
  }
  function options(elementId, roles, placeholder, selected = $(elementId).value) {
    const select = $(elementId);
    select.replaceChildren(new Option(placeholder, ''), ...roles.map(role => new Option(role.name, role.id)));
    select.value = roles.some(role => role.id === selected) ? selected : '';
  }
  function renderEditor() {
    editingRoleId = $('role-edit-selected').value;
    const role = roleData?.roles.find(item => item.id === $('role-edit-selected').value);
    $('role-detail-summary').textContent = role ? `ID: ${role.id} · Position: ${role.position}${role.managed ? ' · Managed by an integration' : ''}${!role.manageable ? ' · Read only' : ''}` : 'Select a role to view its settings.';
    $('role-permissions').textContent = role?.permissions.join(', ') || 'No server permissions.';
    $('role-edit-name').value = role?.name || ''; $('role-edit-color').value = role?.color || '#000000';
    $('role-edit-hoist').checked = role?.hoist === true; $('role-edit-mentionable').checked = role?.mentionable === true;
    setBusy(busy);
  }
  function renderRoles() {
    const editable = roleData.roles.filter(role => role.manageable);
    if (!drafts.has('role-autorole-form')) options('role-autorole', roleData.roles.filter(role => role.manageable || role.id === roleData.autorole.roleId), 'Off — no automatic role', roleData.autorole.roleId);
    $('role-autorole-help').textContent = roleData.autorole.blocked ? 'Verification is enabled. You can turn autorole off, but must disable verification before choosing a role.' : 'Only one autorole is configured. Saved changes apply to future joins.';
    if (!drafts.has('role-member-form')) options('role-member-selected', editable, 'Choose a role');
    if (!drafts.has('role-bulk-form')) {
      options('role-bulk-selected', editable, 'Choose a role');
      options('role-bulk-source', roleData.roles, 'No source-role filter');
    }
    if (!drafts.has('role-edit-form')) {
      options('role-edit-selected', roleData.roles, 'Choose a role'); renderEditor();
    }
    setBusy(busy);
  }
  async function refreshRoles(announce = true) {
    if (refreshing) return;
    refreshing = true; $('refresh-roles').disabled = true;
    try {
      const response = await fetch(dashboardApiUrl('roles'), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load roles.');
      roleData = data; renderRoles();
      if (announce) status(`${data.roles.length} server roles loaded. Your unsaved drafts are preserved.`);
    } catch (error) { status(error.message, true); }
    finally { refreshing = false; setBusy(busy); }
  }
  async function perform(form, body, path = 'roles/action') {
    if (busy || !roleData) return null;
    setBusy(true); status(body.action === 'confirm' ? 'Applying confirmed changes… This may take a moment.' : 'Waiting for DexzuBot…');
    try {
      const result = await post(path, body);
      if (form) dirty(form, false);
      if (result.preview) {
        preview = result.preview;
        $('role-preview-heading').textContent = preview.action === 'delete' ? 'Delete this role?' : 'Review bulk change';
        $('role-preview-copy').textContent = plain(preview.summary);
        $('role-preview-expiry').textContent = `Confirm by ${new Date(preview.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`;
        window.DexzuMotion.cancelDialogClose(dialog); dialog.showModal(); $('role-cancel').focus();
        status('Preview ready. No roles have changed yet.');
      } else {
        const partial = result.result?.failed > 0 || result.result?.stopped;
        status(result.description || 'Autorole settings saved.', Boolean(partial));
        if (partial) toast('Role batch needs attention', 'warning', 'See the result below for changed, skipped, and failed members.');
        else toast(result.title || 'Autorole saved');
        await refreshRoles(false);
      }
      return result;
    } catch (error) {
      status(error.message, true); toast('Could not complete role action', true, error.message);
      return null;
    } finally { setBusy(false); }
  }
  const submit = (id, build, path) => $(id).addEventListener('submit', event => {
    event.preventDefault(); if ($(id).reportValidity()) void perform($(id), build(), path);
  });
  submit('role-autorole-form', () => ({ roleId: $('role-autorole').value || null }), 'roles/autorole');
  submit('role-member-form', () => ({ action: $('role-member-action').value, role: $('role-member-selected').value,
    member: $('role-member-id').value.trim().replace(/^<@!?|>$/g, '') }));
  submit('role-create-form', () => ({ action: 'create', name: $('role-create-name').value.trim(), color: $('role-create-color').value.trim() }));
  submit('role-edit-form', () => ({ action: 'edit', role: $('role-edit-selected').value,
    name: $('role-edit-name').value.trim(), color: $('role-edit-color').value.trim(),
    hoist: $('role-edit-hoist').checked, mentionable: $('role-edit-mentionable').checked }));
  submit('role-bulk-form', () => ({ action: $('role-bulk-action').value, role: $('role-bulk-selected').value,
    audience: $('role-bulk-audience').value, ...($('role-bulk-source').value ? { source: $('role-bulk-source').value } : {}) }));
  $('role-edit-selected').addEventListener('change', () => {
    if (drafts.has('role-edit-form') && !confirm('Discard unsaved changes to this role?')) {
      $('role-edit-selected').value = editingRoleId; return;
    }
    dirty($('role-edit-form'), false); renderEditor();
  });
  $('role-delete').addEventListener('click', () => { void perform(null, { action: 'delete', role: $('role-edit-selected').value }); });
  $('refresh-roles').addEventListener('click', () => { if (!busy) void refreshRoles(); });
  $('role-confirm').addEventListener('click', async () => {
    if (!preview || busy) return;
    const current = preview;
    if (Date.now() >= current.expires) {
      preview = null; await window.DexzuMotion.closeDialog(dialog); status('This preview expired. Create a new one.', true); return;
    }
    preview = null;
    // Consume the local confirmation before yielding; double clicks cannot repeat it.
    await window.DexzuMotion.closeDialog(dialog);
    await perform(null, { action: 'confirm', code: current.code });
  });
  async function cancelPreview() {
    if (busy || !preview) return;
    const current = preview; preview = null;
    await window.DexzuMotion.closeDialog(dialog);
    await perform(null, { action: 'cancel', code: current.code });
  }
  $('role-cancel').addEventListener('click', () => { void cancelPreview(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); void cancelPreview(); });
  window.addEventListener('dexzu-discard', event => {
    if (event.detail !== 'operations') return;
    forms.forEach(form => { dirty(form, false); form.reset(); });
    if (roleData) renderRoles();
  });
  async function loadReleases() {
    try {
      const response = await fetch(dashboardApiUrl('releases'), { cache: 'no-store' });
      if (!response.ok) throw new Error('Release notes could not be loaded.');
      const { releases } = await response.json(), root = $('beta-release-content'); root.replaceChildren();
      for (const release of releases) {
        const title = document.createElement('h3'), date = document.createElement('time'), summary = document.createElement('p');
        title.textContent = release.title; date.dateTime = release.date; date.textContent = release.date; summary.textContent = release.summary;
        const details = document.createElement('details'), toggle = document.createElement('summary'), list = document.createElement('ul');
        toggle.textContent = 'Read the release notes';
        for (const change of [...release.changes, ...release.tryIt, release.scope]) { const item = document.createElement('li'); item.textContent = change; list.append(item); }
        details.append(toggle, list); root.append(title, date, summary, details);
      }
    } catch (error) { $('beta-release-content').textContent = error.message; }
  }
  void refreshRoles();
})();
