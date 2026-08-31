let state;
let youtubeLatest;
let youtubeLatestLoaded = false;
const dirtyPages = new Set();
let safetyPromoDirty = false;
let safetyPingDirty = false;
const $ = id => document.getElementById(id);
const toast = (message, error = false, detail = '') => {
  const type = typeof error === 'string' ? error : (error ? 'error' : 'success');
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  const icons = { success: '✓', error: '!', warning: '⚠', info: 'i' };
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'toast-close'; close.setAttribute('aria-label', 'Dismiss notification'); close.textContent = '×';
  const icon = document.createElement('span'); icon.className = 'toast-icon'; icon.textContent = icons[type] || icons.info;
  const copy = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = message;
  copy.append(title);
  if (detail) { const description = document.createElement('small'); description.textContent = detail; copy.append(description); }
  const progress = document.createElement('i'); progress.className = 'toast-progress';
  element.append(icon, copy, close, progress); $('toasts').append(element);
  const dismiss = () => { element.classList.add('leaving'); setTimeout(() => element.remove(), 180); };
  close.onclick = dismiss;
  let timer = setTimeout(dismiss, 3800);
  element.onmouseenter = () => { clearTimeout(timer); progress.style.animationPlayState = 'paused'; };
  element.onmouseleave = () => { timer = setTimeout(dismiss, 1800); progress.style.animationPlayState = 'running'; };
};
const post = async (path, body) => {
  const response = await fetch(`/dashboard/api/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Update failed');
  return data;
};
const checkbox = (id, label, checked, group) => `<label class="check-row"><input type="checkbox" data-group="${group}" value="${id}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
const channelOptions = (channels, selected, placeholder) => `<option value="">${placeholder}</option>${channels.map(channel => `<option value="${channel.id}" ${channel.id === selected ? 'selected' : ''}>#${channel.name}</option>`).join('')}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const icon = paths => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const icons = {
  members: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  command: icon('<path d="M18 9a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3Z"/>'),
  hash: icon('<path d="M4 9h16M3 15h16M10 3 8 21M16 3l-2 18"/>'), clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  wallet: icon('<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 11h6v4h-6a2 2 0 0 1 0-4Z"/>'),
  trend: icon('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'), shield: icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'),
  chart: icon('<path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/>'), ticket: icon('<path d="M2 9a3 3 0 0 0 0 6v3h20v-3a3 3 0 0 0 0-6V6H2Z"/><path d="M13 6v2M13 11v2M13 16v2"/>'),
};
const pageDetails = {
  overview: ['Overview', "Monitor Dexzu's Dungeon and manage your bot configuration."],
  safety: ['Safety', 'Promotion filters and mention protection.'],
  greetings: ['Greetings', 'Welcome and goodbye member experiences.'],
  leveling: ['Leveling', 'XP rewards, announcements, and progression.'],
  logging: ['Logging', 'Choose which server events are recorded.'],
  youtube: ['YouTube', 'Automatic upload alerts for DexzuGtag.'],
};

function showPage(pageName) {
  const selected = pageDetails[pageName] ? pageName : 'overview';
  const currentPage = document.querySelector('[data-panel].active')?.dataset.panel;
  if (currentPage && currentPage !== selected && dirtyPages.has(currentPage)) {
    if (!confirm('Discard unsaved changes?')) return;
    dirtyPages.delete(currentPage);
    if (state) render(state);
  }
  document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === selected));
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === selected));
  $('page-title').textContent = pageDetails[selected][0];
  $('breadcrumb-page').textContent = pageDetails[selected][0];
  $('page-description').textContent = pageDetails[selected][1];
  history.replaceState(null, '', `#${selected}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (selected === 'youtube') void loadYouTubeLatest();
}

function setDirty(page, dirty = true) {
  if (!['safety', 'greetings', 'leveling', 'logging'].includes(page)) return;
  if (dirty) dirtyPages.add(page); else dirtyPages.delete(page);
  document.querySelector(`[data-panel="${page}"]`)?.classList.toggle('is-dirty', dirty);
}

function channelName(id) { return state?.channels.find(channel => channel.id === id)?.name || 'Not configured'; }
function updateSafetyUi() {
  const promoCount = document.querySelectorAll('[data-group=promo]:checked').length;
  const pingCount = document.querySelectorAll('[data-group=ping]:checked').length;
  $('promo-count').textContent = `${promoCount} channel${promoCount === 1 ? '' : 's'} selected`;
  $('ping-count').textContent = `${pingCount} member${pingCount === 1 ? '' : 's'} protected`;
  $('safety-summary').innerHTML = `<span><i class="status-dot ${$('promo-enabled').checked ? 'good' : ''}"></i>Promotion Filter <b>${$('promo-enabled').checked ? 'Enabled' : 'Disabled'}</b></span><span><i class="status-dot ${pingCount ? 'good' : ''}"></i>Mention Protection <b>${pingCount ? 'Enabled' : 'Disabled'}</b></span>`;
}
function updateGreetingUi() {
  const welcomeChannel = channelName($('welcome-channel').value); const goodbyeChannel = channelName($('goodbye-channel').value);
  $('greeting-summary').innerHTML = [['Welcome Messages', $('welcome-enabled').checked, welcomeChannel, '＋'], ['Goodbye Messages', $('goodbye-enabled').checked, goodbyeChannel, '−']].map(([label, enabled, destination, symbol]) => `<article class="summary-card"><span class="summary-icon">${symbol}</span><div><small>${label}</small><strong><i class="status-dot ${enabled ? 'good' : ''}"></i>${enabled ? 'Enabled' : 'Disabled'}</strong><p>Destination: ${destination === 'Not configured' ? '' : '#'}${escapeHtml(destination)}</p></div></article>`).join('');
  $('welcome-preview').querySelector('p').textContent = $('welcome-message').value.replaceAll('{user}', 'ExampleUser').replaceAll('{server}', state?.server.name || 'the server');
  $('goodbye-preview').querySelector('p').textContent = $('goodbye-message').value.replaceAll('{user.tag}', 'ExampleUser').replaceAll('{server}', state?.server.name || 'the server');
}
function validateLeveling() {
  const min = Number($('leveling-xp-min').value), max = Number($('leveling-xp-max').value), cooldown = Number($('leveling-cooldown').value), multiplier = Number($('leveling-multiplier').value);
  let error = '';
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 1000 || min > max) error = 'Minimum XP must be at least 1 and cannot exceed maximum XP.';
  else if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 3600) error = 'Cooldown must be between 0 and 3600 seconds.';
  else if (!Number.isFinite(multiplier) || multiplier < .1 || multiplier > 10) error = 'Multiplier must be between 0.1× and 10×.';
  $('leveling-error').textContent = error;
  $('save-leveling').disabled = Boolean(error);
  $('leveling-summary').innerHTML = [['Leveling', $('leveling-enabled').checked ? 'Active' : 'Disabled'], ['XP Range', `${min || 0} – ${max || 0}`], ['Cooldown', `${cooldown || 0} sec`], ['Multiplier', `${multiplier || 0}×`]].map(([label,value]) => `<article class="summary-card"><small>${label}</small><strong>${escapeHtml(value)}</strong></article>`).join('');
  return !error;
}
function updateLoggingUi() {
  const checked = document.querySelectorAll('[data-group=logging]:checked').length;
  const total = document.querySelectorAll('[data-group=logging]').length;
  $('logging-enabled-count').textContent = `${checked} of ${total} events enabled`;
  $('logging-bar-count').textContent = `${checked} events enabled`;
  const destination = channelName($('logging-channel').value);
  $('logging-summary').innerHTML = [['Logging', $('logging-enabled').checked ? 'Enabled' : 'Disabled'], ['Destination', `${destination === 'Not configured' ? '' : '#'}${destination}`], ['Events', `${checked} enabled`]].map(([label,value]) => `<article class="summary-card"><small>${label}</small><strong>${escapeHtml(value)}</strong></article>`).join('');
  document.querySelectorAll('.logging-group').forEach(group => { const all = group.querySelectorAll('[data-group=logging]').length; const on = group.querySelectorAll('[data-group=logging]:checked').length; group.querySelector('.group-count').textContent = `${on}/${all} enabled`; });
}

document.querySelectorAll('[data-page]').forEach(button => {
  button.onclick = () => showPage(button.dataset.page);
});
showPage(location.hash.slice(1));

const setSidebarCollapsed = collapsed => {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  $('sidebar-collapse').textContent = collapsed ? '›' : '‹';
  $('sidebar-collapse').setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  localStorage.setItem('dexzu-sidebar-collapsed', String(collapsed));
};
setSidebarCollapsed(localStorage.getItem('dexzu-sidebar-collapsed') === 'true');
$('sidebar-collapse').onclick = () => setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
$('view-logs').onclick = () => showPage('logging');

function render(current) {
  state = current;
  $('bot-avatar').src = current.bot.avatar;
  $('server-icon').src = current.server.icon || current.bot.avatar;
  $('server-name').textContent = current.server.name;
  $('server-status-dot').className = current.bot.online ? 'online' : '';
  $('online-pill').textContent = current.bot.online ? 'Online' : 'Offline';
  $('online-pill').className = `pill ${current.bot.online ? 'online' : ''}`;
  const metricIcons = { Members: icons.members, Commands: icons.command, Channels: icons.hash, Uptime: icons.clock };
  const uptimeHours = Math.floor(current.bot.uptimeSeconds / 3600);
  $('metrics').innerHTML = [['Members', current.server.members, `${current.server.members} total`], ['Commands', current.bot.loadedCommands, `${current.bot.loadedCommands} loaded`], ['Channels', current.server.channels, 'Server total'], ['Uptime', `${uptimeHours}h`, 'Since restart']].map(([key, value, secondary]) => `<div class="metric"><div class="metric-icon">${metricIcons[key]}</div><strong>${value}</strong><span>${key}</span><small>${secondary}</small></div>`).join('');
  const moduleMeta = {
    core: [icons.command, 'Essential bot functionality'], counting: [icons.hash, 'Server counting game'], economy: [icons.wallet, 'Currency and economy commands'],
    leveling: [icons.trend, 'XP and member progression'], moderation: [icons.shield, 'Staff moderation tools'], serverstats: [icons.chart, 'Live server statistics'],
    ticket: [icons.ticket, 'Private support tickets'], tickets: [icons.ticket, 'Private support tickets'],
  };
  $('categories').innerHTML = current.categories.map(category => {
    const meta = moduleMeta[category.key.toLowerCase()] || [icons.command, 'Discord command module'];
    return `<div class="toggle-row ${category.enabled ? '' : 'module-disabled'}"><div class="module-copy"><span class="module-icon">${meta[0]}</span><div><strong>${category.name}</strong><em>${meta[1]}</em><small>${category.enabledCommands} / ${category.totalCommands} commands</small></div></div><label class="switch"><input data-category="${category.key}" data-name="${category.name}" type="checkbox" ${category.enabled ? 'checked' : ''} aria-label="Toggle ${category.name}"><span></span></label></div>`;
  }).join('');
  const databaseReady = current.database?.isAvailable === true && current.database?.isDegraded !== true;
  $('system-status').innerHTML = [
    ['Bot', current.bot.online ? 'Online' : 'Offline', current.bot.online ? 'good' : 'bad'],
    ['Discord API', current.bot.online ? 'Connected' : 'Disconnected', current.bot.online ? 'good' : 'bad'],
    ['WebSocket', current.bot.online ? 'Connected' : 'Disconnected', current.bot.online ? 'good' : 'bad'],
    ...(current.database ? [['Database', databaseReady ? 'Connected' : 'Degraded', databaseReady ? 'good' : 'warning']] : []),
    ['Dashboard API', 'Connected', 'good'],
    ['Uptime', `${uptimeHours}h ${Math.floor((current.bot.uptimeSeconds % 3600) / 60)}m`, current.bot.online ? 'good' : 'bad'],
  ].map(([label, value, status]) => `<div class="status-row"><span>${label}</span><strong><i class="status-dot ${status}"></i>${value}</strong></div>`).join('');
  $('performance').innerHTML = [
    ['Uptime', `${uptimeHours}h ${Math.floor((current.bot.uptimeSeconds % 3600) / 60)}m`, Math.min(100, current.bot.uptimeSeconds / 864)],
    ['Commands loaded', current.bot.loadedCommands, Math.min(100, current.bot.loadedCommands)],
  ].map(([label, value, meter]) => `<div class="performance-row"><div><span>${label}</span><strong>${value}</strong></div><i><b style="width:${meter}%"></b></i></div>`).join('');
  document.querySelectorAll('[data-category]').forEach(element => { element.onchange = async () => {
    const row = element.closest('.toggle-row'); const enabled = element.checked; const name = element.dataset.name;
    row.classList.toggle('module-disabled', !enabled); row.classList.add('module-updating'); element.disabled = true;
    try { await post('category', { category: element.dataset.category, enabled }); row.classList.add('module-flash'); setTimeout(() => row.classList.remove('module-flash'), 500); toast(`${name} ${enabled ? 'enabled' : 'disabled'}`, false, `${name} commands are now ${enabled ? 'active' : 'inactive'}.`); }
    catch (error) { element.checked = !enabled; row.classList.toggle('module-disabled', enabled); toast(`Couldn't update ${name}.`, true, error.message); }
    finally { row.classList.remove('module-updating'); element.disabled = false; }
  }; });
  $('promo-enabled').checked = current.antiPromo.enabled;
  $('promo-channels').innerHTML = current.channels.map(channel => checkbox(channel.id, `#${channel.name}`, current.antiPromo.allowedChannelIds.includes(channel.id), 'promo')).join('');
  $('ping-owners').innerHTML = current.owners.map(owner => `<label class="check-row owner-row"><input type="checkbox" data-group="ping" value="${owner.id}" ${current.antiPing.protectedUserIds.includes(owner.id) ? 'checked' : ''}><span class="owner-avatar">${owner.avatar ? `<img src="${escapeHtml(owner.avatar)}" alt="">` : '@'}</span><span><b>${escapeHtml(owner.name)}</b><small>Protected from direct mentions</small></span></label>`).join('');
  $('greeting-cards').checked = current.greetings.cardEnabled;
  $('welcome-enabled').checked = current.greetings.welcomeEnabled;
  $('welcome-channel').innerHTML = channelOptions(current.channels, current.greetings.welcomeChannelId, 'Choose a welcome channel');
  $('welcome-message').value = current.greetings.welcomeMessage;
  $('goodbye-enabled').checked = current.greetings.goodbyeEnabled;
  $('goodbye-channel').innerHTML = channelOptions(current.channels, current.greetings.goodbyeChannelId, 'Choose a goodbye channel');
  $('goodbye-message').value = current.greetings.goodbyeMessage;
  $('leveling-enabled').checked = current.leveling.enabled;
  $('leveling-announce').checked = current.leveling.announceLevelUp;
  $('leveling-channel').innerHTML = channelOptions(current.channels, current.leveling.channelId, 'Choose a level-up channel');
  $('leveling-xp-min').value = current.leveling.xpMin;
  $('leveling-xp-max').value = current.leveling.xpMax;
  $('leveling-cooldown').value = current.leveling.cooldown;
  $('leveling-multiplier').value = current.leveling.multiplier;
  $('logging-enabled').checked = current.logging.enabled;
  $('logging-channel').innerHTML = channelOptions(current.channels, current.logging.channelId, 'Choose a log channel');
  const logGroups = { Moderation: [], Messages: [], Voice: [], Members: [], Channels: [], Server: [] };
  current.logging.events.forEach(event => {
    const prefix = event.key.split('.')[0];
    const group = prefix === 'moderation' ? 'Moderation' : prefix === 'message' ? 'Messages' : prefix === 'voice' ? 'Voice' : prefix === 'member' ? 'Members' : prefix === 'channel' ? 'Channels' : 'Server';
    logGroups[group].push(event);
  });
  $('logging-events').innerHTML = Object.entries(logGroups).filter(([,events]) => events.length).map(([group, events]) => `<details class="logging-group" open><summary><span>${group}</span><b class="group-count">${events.filter(event => event.enabled).length}/${events.length} enabled</b></summary><div class="group-actions"><button type="button" data-log-action="on">Enable All</button><button type="button" data-log-action="off">Disable All</button></div><div class="group-events">${events.map(event => checkbox(event.key, event.label, event.enabled, 'logging')).join('')}</div></details>`).join('');
  $('youtube-enabled').checked = current.youtube.enabled;
  $('youtube-channel').innerHTML = channelOptions(current.channels, current.youtube.channelId, 'Choose a channel');
  $('youtube-preview-avatar').src = current.bot.avatar;
  updateSafetyUi(); updateGreetingUi(); validateLeveling(); updateLoggingUi();
  safetyPromoDirty = false; safetyPingDirty = false;
  ['safety','greetings','leveling','logging'].forEach(page => setDirty(page, false));
  bindControlEvents();
  updateYouTubeSummary();
  renderYouTubeLatest();
}

function selectedYouTubeChannel() {
  return state?.channels.find(channel => channel.id === $('youtube-channel').value) || null;
}

function bindControlEvents() {
  const bind = (ids, page, update) => ids.forEach(id => { const element = $(id); element.oninput = element.onchange = () => { setDirty(page); update?.(); }; });
  $('promo-enabled').onchange = () => { safetyPromoDirty = true; setDirty('safety'); updateSafetyUi(); };
  document.querySelectorAll('[data-group=promo],[data-group=ping]').forEach(input => { input.onchange = () => { if (input.dataset.group === 'promo') safetyPromoDirty = true; else safetyPingDirty = true; setDirty('safety'); updateSafetyUi(); input.closest('.check-row')?.classList.toggle('selected', input.checked); }; input.closest('.check-row')?.classList.toggle('selected', input.checked); });
  $('promo-search').oninput = () => { const query = $('promo-search').value.trim().toLowerCase(); document.querySelectorAll('[data-group=promo]').forEach(input => { input.closest('.check-row').hidden = !input.closest('.check-row').textContent.toLowerCase().includes(query); }); };
  bind(['greeting-cards','welcome-enabled','welcome-channel','welcome-message','goodbye-enabled','goodbye-channel','goodbye-message'], 'greetings', updateGreetingUi);
  bind(['leveling-enabled','leveling-announce','leveling-channel','leveling-xp-min','leveling-xp-max','leveling-cooldown','leveling-multiplier'], 'leveling', validateLeveling);
  bind(['logging-enabled','logging-channel'], 'logging', updateLoggingUi);
  document.querySelectorAll('[data-group=logging]').forEach(input => { input.onchange = () => { setDirty('logging'); updateLoggingUi(); }; });
  document.querySelectorAll('[data-log-action]').forEach(button => { button.onclick = () => { button.closest('.logging-group').querySelectorAll('[data-group=logging]').forEach(input => { input.checked = button.dataset.logAction === 'on'; }); setDirty('logging'); updateLoggingUi(); }; });
  $('logging-all').onclick = () => { document.querySelectorAll('[data-group=logging]').forEach(input => { input.checked = true; }); setDirty('logging'); updateLoggingUi(); };
  $('logging-none').onclick = () => { document.querySelectorAll('[data-group=logging]').forEach(input => { input.checked = false; }); setDirty('logging'); updateLoggingUi(); };
  $('logging-search').oninput = () => { const query = $('logging-search').value.trim().toLowerCase(); document.querySelectorAll('.logging-group').forEach(group => { let visible = 0; group.querySelectorAll('.check-row').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(query); if (!row.hidden) visible += 1; }); group.hidden = visible === 0; if (query && visible) group.open = true; }); };
  $('logging-discard').onclick = () => { dirtyPages.delete('logging'); render(state); };
}

function updateYouTubeSummary() {
  if (!state) return;
  const enabled = $('youtube-enabled').checked;
  const channel = selectedYouTubeChannel();
  $('youtube-state-label').textContent = enabled ? 'Active' : 'Disabled';
  $('youtube-state-pill').classList.toggle('active', enabled);
  $('youtube-destination').textContent = channel ? `#${channel.name}` : 'Not configured';
  $('youtube-hero').classList.toggle('disabled', !enabled);
  $('youtube-control').classList.toggle('alerts-disabled', !enabled);
  $('youtube-service-status').innerHTML = [
    ['YouTube alerts', enabled ? 'Active' : 'Disabled', enabled ? 'good' : ''],
    ['Destination', channel ? `#${channel.name}` : 'Not configured', channel ? 'good' : 'warning'],
    ['Duplicate protection', 'Enabled', 'good'],
    ...(state.youtube.lastPostedAt ? [['Last notification', new Date(state.youtube.lastPostedAt).toLocaleString(), 'good']] : []),
  ].map(([label, value, status]) => `<div class="status-row"><span>${escapeHtml(label)}</span><strong><i class="status-dot ${status}"></i>${escapeHtml(value)}</strong></div>`).join('');
}

function renderYouTubeLatest() {
  if (!state) return;
  const latest = $('youtube-latest');
  const previewMedia = $('youtube-preview-media');
  const latestLink = $('youtube-latest-link');
  const previewLink = $('youtube-preview-link');
  if (!youtubeLatest) {
    latest.className = 'youtube-empty';
    latest.innerHTML = '<span>▶</span><strong>No upload information available yet.</strong>';
    latestLink.removeAttribute('href'); previewLink.removeAttribute('href');
    $('youtube-preview-title').textContent = 'Video title preview';
    previewMedia.innerHTML = '<span>▶</span>';
    return;
  }
  const published = youtubeLatest.publishedAt ? new Date(youtubeLatest.publishedAt).toLocaleString() : 'Publish time unavailable';
  const notified = state.youtube.lastVideoId === youtubeLatest.id && Boolean(state.youtube.lastPostedAt);
  latest.className = 'latest-video';
  latest.innerHTML = `<img src="${escapeHtml(youtubeLatest.thumbnailUrl)}" alt="Latest DexzuGtag upload thumbnail"><div><p class="eyebrow">DEXZUGTAG</p><h3>${escapeHtml(youtubeLatest.title)}</h3><p>${escapeHtml(published)}</p><span class="sent-status">${notified ? '✓ Notification sent' : 'Waiting for next upload'}</span></div>`;
  latestLink.href = youtubeLatest.url; previewLink.href = youtubeLatest.url;
  $('youtube-preview-title').textContent = youtubeLatest.title;
  previewMedia.innerHTML = `<img src="${escapeHtml(youtubeLatest.thumbnailUrl)}" alt="Latest upload preview">`;
  if (notified) {
    $('youtube-notifications').className = 'latest-video notification-item';
    $('youtube-notifications').innerHTML = `<img src="${escapeHtml(youtubeLatest.thumbnailUrl)}" alt=""><div><h3>${escapeHtml(youtubeLatest.title)}</h3><p>${escapeHtml(new Date(state.youtube.lastPostedAt).toLocaleString())} • ${escapeHtml($('youtube-destination').textContent)}</p><span class="sent-status">✓ Sent</span></div>`;
  }
}

async function loadYouTubeLatest() {
  if (youtubeLatestLoaded) return;
  youtubeLatestLoaded = true;
  try {
    const response = await fetch('/dashboard/api/youtube/latest', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Latest upload unavailable');
    youtubeLatest = data.video;
  } catch (error) {
    youtubeLatest = null;
  }
  renderYouTubeLatest();
}

async function load() {
  const response = await fetch('/dashboard/api/state', { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load dashboard');
  render(data);
}

$('refresh-dashboard').onclick = async () => {
  const button = $('refresh-dashboard');
  button.classList.add('loading');
  button.disabled = true;
  try { await load(); toast('Refreshed', false, 'System status updated.'); }
  catch (error) { toast(error.message, true); }
  finally { button.classList.remove('loading'); button.disabled = false; }
};

$('save-promo').onclick = async () => { try { const allowedChannelIds = [...document.querySelectorAll('[data-group=promo]:checked')].map(input => input.value); await post('anti-promo', { enabled: $('promo-enabled').checked, allowedChannelIds }); state.antiPromo = { enabled: $('promo-enabled').checked, allowedChannelIds }; safetyPromoDirty = false; setDirty('safety', safetyPingDirty); toast('Promotion filter saved'); } catch (error) { toast("Couldn't save promotion filter", true, error.message); } };
$('save-ping').onclick = async () => { try { const protectedUserIds = [...document.querySelectorAll('[data-group=ping]:checked')].map(input => input.value); await post('anti-ping', { protectedUserIds }); state.antiPing.protectedUserIds = protectedUserIds; safetyPingDirty = false; setDirty('safety', safetyPromoDirty); toast('Mention protection saved'); } catch (error) { toast("Couldn't save mention protection", true, error.message); } };
$('save-greetings').onclick = async () => { try { const settings = { cardEnabled: $('greeting-cards').checked, welcomeEnabled: $('welcome-enabled').checked, welcomeChannelId: $('welcome-channel').value, welcomeMessage: $('welcome-message').value, goodbyeEnabled: $('goodbye-enabled').checked, goodbyeChannelId: $('goodbye-channel').value, goodbyeMessage: $('goodbye-message').value }; await post('greetings', settings); state.greetings = { ...state.greetings, ...settings }; setDirty('greetings', false); toast('Greeting settings saved'); } catch (error) { toast("Couldn't save greeting settings", true, error.message); } };
$('save-leveling').onclick = async () => {
  const button = $('save-leveling');
  if (button.disabled) return;
  if (!validateLeveling()) return;
  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    const settings = {
      enabled: $('leveling-enabled').checked,
      announceLevelUp: $('leveling-announce').checked,
      channelId: $('leveling-channel').value,
      xpMin: Number($('leveling-xp-min').value),
      xpMax: Number($('leveling-xp-max').value),
      cooldown: Number($('leveling-cooldown').value),
      multiplier: Number($('leveling-multiplier').value),
    };
    await post('leveling', settings);
    state.leveling = { ...state.leveling, ...settings }; setDirty('leveling', false);
    toast('Leveling settings saved');
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = '✓ Save Changes';
  }
};
$('reset-leveling').onclick = async () => { if (!confirm(`Reset all XP?\n\nThis will permanently reset XP and levels for every member in ${state.server.name}. This action cannot be undone.`)) return; const confirmation = prompt(`Type ${state.server.name} to confirm the reset:`); if (confirmation === null) return; try { const result = await post('leveling/reset', { confirm: confirmation }); toast(`Reset XP for ${result.resetCount} members`); } catch (error) { toast(error.message, true); } };
$('save-logging').onclick = async () => { try { const enabledEventTypes = [...document.querySelectorAll('[data-group=logging]:checked')].map(input => input.value); const enabled = $('logging-enabled').checked; const channelId = $('logging-channel').value; await post('logging', { enabled, channelId, enabledEventTypes }); state.logging.enabled = enabled; state.logging.channelId = channelId; state.logging.events.forEach(event => { event.enabled = enabledEventTypes.includes(event.key); }); setDirty('logging', false); toast('Logging settings saved'); } catch (error) { toast("Couldn't save logging settings", true, error.message); } };
$('youtube-channel').onchange = () => { document.querySelector('.youtube-config').classList.add('dirty'); updateYouTubeSummary(); };
$('youtube-enabled').onchange = async () => {
  const input = $('youtube-enabled'); const previous = !input.checked; const enabled = input.checked;
  input.disabled = true; updateYouTubeSummary();
  try {
    await post('youtube', { enabled, channelId: $('youtube-channel').value });
    state.youtube.enabled = enabled; state.youtube.channelId = $('youtube-channel').value || state.youtube.channelId;
    document.querySelector('.youtube-config').classList.remove('dirty');
    toast(`YouTube alerts ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    input.checked = previous; updateYouTubeSummary();
    toast(`Couldn't ${enabled ? 'enable' : 'disable'} YouTube alerts`, true, error.message);
  } finally { input.disabled = false; }
};
$('save-youtube').onclick = async () => {
  const button = $('save-youtube'); button.disabled = true;
  try {
    const enabled = $('youtube-enabled').checked; const channelId = $('youtube-channel').value;
    await post('youtube', { enabled, channelId });
    state.youtube.enabled = enabled; state.youtube.channelId = channelId || state.youtube.channelId;
    document.querySelector('.youtube-config').classList.remove('dirty'); updateYouTubeSummary();
    toast('YouTube settings saved');
  } catch (error) { toast("Couldn't save YouTube settings", true, error.message); }
  finally { button.disabled = false; }
};
$('test-youtube').onclick = async () => {
  const channel = selectedYouTubeChannel();
  if (!channel) { toast('Choose a destination channel', 'warning'); return; }
  if (!confirm(`Send a test notification to #${channel.name}?`)) return;
  const button = $('test-youtube'); button.disabled = true;
  try { await post('youtube/test', { channelId: channel.id }); toast('Test notification sent', false, `Posted in #${channel.name}.`); }
  catch (error) { toast("Couldn't send test notification", true, error.message); }
  finally { button.disabled = false; }
};
load().catch(error => toast(error.message, true));
window.addEventListener('beforeunload', event => { if (!dirtyPages.size) return; event.preventDefault(); event.returnValue = ''; });
