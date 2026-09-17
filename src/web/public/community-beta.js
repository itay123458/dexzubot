(() => {
  if (dashboardWorkspace !== 'beta') return;
  const root = $('beta-community-controls');
  if (!root) return;
  root.hidden = false;
  const drafts = new Set(), forms = new Map();
  const names = { inviteRewards: 'Invite rewards', ticketCategories: 'Ticket categories', applications: 'Staff applications', leave: 'Leave of absence', activity: 'Staff activity', serverInfo: 'Server information' };
  let data, busy = false, refreshing = false, lastRefresh = 0;
  const el = (tag, text, attributes = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  };
  const status = (text, error = false) => { $('community-status').textContent = text; $('community-status').dataset.error = String(error); };
  function dirty(key, value) {
    if (value) drafts.add(key); else drafts.delete(key);
    setDirty('operations', value, `community-beta:${key}`);
  }
  function lock() {
    root.setAttribute('aria-busy', String(busy || refreshing));
    root.querySelectorAll('fieldset').forEach(field => { field.disabled = busy || refreshing || !data; });
    $('community-refresh').disabled = busy || refreshing;
  }
  function field(parent, key, label, type = 'text', value = '', choices = []) {
    const id = `community-${parent.closest('form').dataset.key}-${key}`;
    const wrapper = el('label', label, { for: id });
    let input;
    if (type === 'select') {
      input = el('select', undefined, { id, name: key });
      input.append(new Option('Not configured', ''), ...choices.map(item => new Option(item.name, item.id)));
      if (value && !choices.some(item => item.id === value)) input.append(new Option(`Unavailable (${value})`, value));
      input.value = value || '';
    } else {
      input = el(type === 'textarea' ? 'textarea' : 'input', undefined, { id, name: key });
      if (type !== 'textarea') input.type = type;
      if (type === 'checkbox') { input.checked = value === true; wrapper.className = 'community-check'; }
      else input.value = value ?? '';
    }
    wrapper.append(input); parent.append(wrapper); return input;
  }
  const val = (form, key) => form.elements.namedItem(key).value;
  const checked = (form, key) => form.elements.namedItem(key).checked;
  function makeForm(key, title) {
    const form = el('form', undefined, { class: 'card', 'data-key': key });
    form.append(el('h3', title));
    const fieldset = el('fieldset'); form.append(fieldset);
    form.addEventListener('input', () => dirty(key, true));
    forms.set(key, form); return { form, fieldset };
  }
  function addActions(fieldset, key, build) {
    const actions = el('div', undefined, { class: 'community-actions' });
    actions.append(el('button', 'Save settings', { type: 'submit', class: 'primary' }));
    if (names[key]) {
      const publish = el('button', key === 'activity' ? 'Publish activity panel' : 'Publish panel', { type: 'button' });
      publish.addEventListener('click', () => {
        if (drafts.has(key) || drafts.has('shared')) { status('Save or discard settings for this panel and staff access before publishing.', true); return; }
        void perform(null, 'publish', { kind: key }, 'Panel published.');
      });
      actions.append(publish);
    }
    fieldset.append(actions);
    const form = fieldset.closest('form');
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!form.reportValidity()) return;
      try { void perform(key, 'settings', build(form), 'Community settings saved.'); }
      catch (error) { status(error.message, true); }
    });
  }
  function renderForms() {
    const config = data.config;
    for (const key of ['shared', ...Object.keys(names)]) {
      if (drafts.has(key)) continue;
      const old = forms.get(key), { form, fieldset } = makeForm(key, key === 'shared' ? 'Staff access and update DMs' : names[key]);
      if (key === 'shared') {
        for (const [id, label] of [['staffRoleId', 'Staff role'], ['reviewerRoleId', 'Reviewer role']]) field(fieldset, id, label, 'select', config[id], data.roles);
        field(fieldset, 'reviewChannelId', 'Private review channel', 'select', config.reviewChannelId, data.channels);
        fieldset.append(el('p', 'Choose a private channel for applications and leave reviews. DMs are optional updates for the involved member only.'));
        for (const [id, label] of [['applications', 'Application update DMs'], ['tickets', 'Ticket open/close DMs'], ['leave', 'Leave request update DMs']]) field(fieldset, id, label, 'checkbox', config.dmUpdates[id]);
        addActions(fieldset, key, f => ({ staffRoleId: val(f, 'staffRoleId') || null, reviewerRoleId: val(f, 'reviewerRoleId') || null, reviewChannelId: val(f, 'reviewChannelId') || null, dmUpdates: Object.fromEntries(['applications', 'tickets', 'leave'].map(id => [id, checked(f, id)])) }));
      } else {
        field(fieldset, 'enabled', `Enable ${names[key].toLowerCase()}`, 'checkbox', config.features[key]);
        if (key !== 'ticketCategories') field(fieldset, 'channel', 'Panel channel', 'select', config.channels[key], data.channels);
        if (key === 'ticketCategories') for (const [id, label] of [['support', 'General support'], ['report', 'Report a member'], ['partnership', 'Partnership']]) field(fieldset, id, label, 'checkbox', config.ticketButtons[id]);
        if (key === 'ticketCategories') fieldset.append(el('p', 'Uses the Tickets module’s panel channel, category and support role. Buttons: General support, Report a member and Partnership.'));
        if (key === 'inviteRewards') {
          fieldset.append(el('p', 'One milestone per line: invites:coins. Rewards require retained, attributed joins; ambiguous joins do not count.'));
          const milestones = field(fieldset, 'milestones', 'Reward milestones (1–10)', 'textarea', config.milestones.map(m => `${m.invites}:${m.coins}`).join('\n')); milestones.required = true;
          const age = field(fieldset, 'minAccountDays', 'Minimum account age (days)', 'number', config.minAccountDays); age.min = '0'; age.max = '365'; age.required = true;
          const stay = field(fieldset, 'minimumStayHours', 'Minimum membership (hours)', 'number', config.minimumStayHours); stay.min = '0'; stay.max = '720'; stay.required = true;
        }
        if (key === 'applications') {
          fieldset.append(el('p', 'One question per line, up to 10. Prefix a question with ? to make it optional.'));
          field(fieldset, 'questions', 'Application questions', 'textarea', config.questions.map(q => `${q.required ? '' : '? '}${q.label}`).join('\n')).required = true;
        }
        if (key === 'leave') fieldset.append(el('p', 'Staff can request 1–14 days away. Approved leave expires automatically and is excluded from activity audits.'));
        if (key === 'activity') fieldset.append(el('p', 'Checks track staff responses and approved leave. Start and close checks in Staff requests below. No reminder DMs.'));
        if (key === 'serverInfo') for (const id of ['rules', 'support', 'applications', 'giveaways', 'community', 'counting']) field(fieldset, id, `${id[0].toUpperCase()}${id.slice(1)} link`, 'select', config.links[id], data.channels);
        addActions(fieldset, key, f => {
          const patch = { features: { [key]: checked(f, 'enabled') } };
          if (key === 'ticketCategories') patch.ticketButtons = Object.fromEntries(['support', 'report', 'partnership'].map(id => [id, checked(f, id)]));
          if (key !== 'ticketCategories') patch.channels = { [key]: val(f, 'channel') || null };
          if (key === 'inviteRewards') {
            const lines = val(f, 'milestones').trim().split('\n');
            if (lines.length > 10 || lines.some(line => !/^\s*\d+\s*:\s*\d+\s*$/.test(line))) throw new Error('Enter 1–10 milestones using invites:coins, one per line.');
            patch.milestones = lines.map(line => { const [invites, coins] = line.split(':').map(Number); return { invites, coins }; });
            patch.minAccountDays = Number(val(f, 'minAccountDays')); patch.minimumStayHours = Number(val(f, 'minimumStayHours'));
          }
          if (key === 'applications') patch.questions = val(f, 'questions').trim().split('\n').map(line => ({ label: line.replace(/^\?\s*/, '').trim(), required: !line.startsWith('?') }));
          if (key === 'serverInfo') patch.links = Object.fromEntries(['rules', 'support', 'applications', 'giveaways', 'community', 'counting'].map(id => [id, val(f, id) || null]));
          return patch;
        });
      }
      if (old) old.replaceWith(form); else $('community-forms').append(form);
    }
  }
  function renderStaff() {
    const container = $('community-staff');
    const savedDrafts = new Map([...container.querySelectorAll('form')]
      .filter(form => drafts.has(`staff:${form.dataset.key}`))
      .map(form => [form.dataset.key, Object.fromEntries([...form.elements].filter(input => input.name).map(input => [input.name, input.value]))]));
    container.replaceChildren();
    const staff = data.staff || {};
    let pending = 0;
    for (const kind of ['applications', 'leave']) for (const item of staff[kind] || []) {
      if (!['submitted', 'pending'].includes(item.status)) continue;
      pending++;
      const form = el('form', undefined, { class: 'community-request', 'data-key': item.id });
      const fieldset = el('fieldset'); form.append(fieldset);
      fieldset.append(el('h4', `${kind === 'leave' ? 'Leave' : 'Application'} · Member ${item.userId}`));
      if (kind === 'leave') fieldset.append(el('p', `${item.days} days · ${item.reason}`));
      else {
        const details = el('details'); details.append(el('summary', 'Read application answers'));
        (item.questions || []).forEach((question, i) => { details.append(el('h5', question.label), el('p', item.answers?.[i] || 'No answer')); });
        fieldset.append(details);
      }
      const reason = field(fieldset, 'reason', 'Review reason (optional)', 'text'); reason.maxLength = 1000; reason.value = savedDrafts.get(item.id)?.reason || '';
      const actions = el('div', undefined, { class: 'community-actions' });
      for (const decision of ['approved', 'denied']) {
        const button = el('button', decision === 'approved' ? 'Approve' : 'Deny', { type: 'button' });
        button.addEventListener('click', () => { void perform('staff:' + item.id, 'staff', { action: 'review', input: { id: item.id, status: decision, reason: reason.value.trim() } }, `Request ${decision}.`); });
        actions.append(button);
      }
      fieldset.append(actions); form.addEventListener('submit', event => event.preventDefault()); form.addEventListener('input', () => dirty('staff:' + item.id, true)); container.append(form);
    }
    if (!pending) container.append(el('p', 'No requests awaiting review.'));
    const activityForm = el('form', undefined, { 'data-key': 'activity-start' }), fieldset = el('fieldset'); activityForm.append(fieldset);
    const hours = field(fieldset, 'hours', 'Activity check duration (1–336 hours)', 'number', 24); hours.min = '1'; hours.max = '336'; hours.required = true; hours.value = savedDrafts.get('activity-start')?.hours || 24;
    fieldset.append(el('button', 'Start activity check', { type: 'submit' }));
    activityForm.addEventListener('input', () => dirty('staff:activity-start', true));
    activityForm.addEventListener('submit', event => { event.preventDefault(); if (activityForm.reportValidity()) void perform('staff:activity-start', 'staff', { action: 'activity-start', input: { hours: Number(hours.value) } }, 'Activity check started.'); });
    container.append(activityForm);
    for (const check of (staff.activityChecks || []).slice(-10).reverse()) {
      const section = el('section', undefined, { class: 'community-request' });
      section.append(el('h4', `Activity check · ${check.status}`), el('p', `${check.responses?.length || 0} responses · ${check.eligible?.length || 0} eligible · Deadline ${new Date(check.deadline).toLocaleString()}`));
      if (check.status === 'open') {
        const close = el('button', 'Close and audit', { type: 'button' }); close.addEventListener('click', () => { void perform(null, 'staff', { action: 'activity-end', input: { id: check.id } }, 'Activity check closed.'); });
        const controls = el('fieldset'); controls.append(close); section.append(controls);
      } else for (const key of ['responded', 'missing', 'excluded']) section.append(el('p', `${key}: ${check.audit?.[key]?.join(', ') || 'None'}`));
      container.append(section);
    }
  }
  async function refresh(announce = false) {
    if (busy || refreshing) return;
    refreshing = true; lock();
    try {
      const response = await fetch(dashboardApiUrl('community-beta'), { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load community settings.');
      data = result; renderForms(); renderStaff(); lastRefresh = Date.now();
      if (announce) status('Community settings loaded. Unsaved drafts are preserved.');
    } catch (error) { status(error.message, true); }
    finally { refreshing = false; lock(); }
  }
  async function perform(key, path, body, success) {
    if (busy || refreshing || !data) return;
    busy = true; lock(); status('Waiting for DexzuBot...');
    try {
      const result = await post(`community-beta/${path}`, body);
      if (key) dirty(key, false);
      if (result.config) data.config = result.config;
      const notification = result.result?.notification;
      const deliveryWarning = notification && !notification.sent && notification.reason !== 'disabled'
        ? 'The result was saved, but the member DM could not be delivered.'
        : result.result?.published === false ? 'The activity check was saved, but its Discord panel could not be delivered. Publish the activity panel to retry.' : null;
      const warning = result.warning || deliveryWarning;
      status(warning || `${result.result?.description || success}${notification?.sent ? ' Member notified by DM.' : ''}`, Boolean(warning));
      toast(warning ? 'Saved; delivery needs attention' : success, warning ? 'warning' : undefined);
      busy = false; await refresh(false);
    } catch (error) { status(error.message, true); toast('Community action failed', true, error.message); }
    finally { busy = false; lock(); }
  }
  $('community-refresh').addEventListener('click', () => { void refresh(true); });
  window.addEventListener('dexzu-discard', event => {
    if (event.detail !== 'operations') return;
    [...drafts].forEach(key => dirty(key, false));
    if (data) { renderForms(); renderStaff(); lock(); }
  });
  window.addEventListener('dexzu-state', () => { if (Date.now() - lastRefresh > 30000) void refresh(false); });
  void refresh(true);
})();

