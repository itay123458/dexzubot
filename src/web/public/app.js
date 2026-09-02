let state;
let youtubeLatest;
let youtubeLatestLoaded = false;
const dirtyPages = new Set();
let safetyPromoDirty = false;
let safetyPingDirty = false;
let safetyAdvancedDirty = false;
let levelingSettingsDirty = false;
let levelingRewardsDirty = false;
let levelRewardDraft = [];
let activityExpanded = false;
let hasAnimatedStats = false;
let previousMetricValues = null;
let previousPerformanceValues = null;
let latestActivityId = null;
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
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateNumber(element, from, to, duration) {
  if (!element || reducedMotion() || from === to) { if (element) element.textContent = String(to); return; }
  const started = performance.now();
  const frame = now => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function showSaved(button, originalLabel = '✓ Save Changes') {
  if (!button) return;
  clearTimeout(button._savedTimer);
  requestAnimationFrame(() => { button.classList.add('saved-feedback'); button.textContent = '✓ Saved'; });
  button._savedTimer = setTimeout(() => { button.classList.remove('saved-feedback'); button.textContent = originalLabel; }, 1300);
}

function updateNavIndicator() {
  const nav = document.querySelector('.dashboard-nav');
  const active = nav?.querySelector('.nav-item.active');
  const indicator = $('nav-active-indicator');
  if (!nav || !active || !indicator || window.innerWidth <= 680) return;
  indicator.style.setProperty('--indicator-y', `${active.offsetTop + 10}px`);
  indicator.style.setProperty('--indicator-height', `${Math.max(20, active.offsetHeight - 20)}px`);
  indicator.classList.add('ready');
}
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
  'module-counting': ['Counting', 'Manage the server counting game commands.'],
  'module-economy': ['Economy', 'Manage currency, rewards, shops, and economy commands.'],
  'module-moderation': ['Moderation', 'Manage staff moderation and member safety commands.'],
  'module-ticket': ['Tickets', 'Manage private support ticket commands.'],
  'module-serverstats': ['Server Stats', 'Manage live server statistic counter commands.'],
};

const moduleDetails = {
  counting: { icon: '#', label: 'Counting', eyebrow: 'COMMUNITY GAME', description: 'Keep a shared counting sequence running with streaks and leaderboards.', examples: ['/count setup', '/count status', '/count reset', '/count leaderboard'] },
  economy: { icon: '◇', label: 'Economy', eyebrow: 'SERVER ECONOMY', description: 'Currency, work, games, inventory, shops, and staff balance controls.', examples: ['/balance', '/daily', '/shop', '/economy dashboard'] },
  moderation: { icon: '◆', label: 'Moderation', eyebrow: 'STAFF TOOLS', description: 'Bans, kicks, timeouts, warnings, locks, notes, and other staff actions.', examples: ['/ban', '/timeout', '/warn', '/cases'] },
  ticket: { icon: '▣', label: 'Tickets', eyebrow: 'MEMBER SUPPORT', description: 'Private support tickets, priorities, staff access, and ticket panels.', examples: ['/ticket setup', '/ticket dashboard', '/claim', '/close'] },
  serverstats: { icon: '▥', label: 'Server Stats', eyebrow: 'LIVE COUNTERS', description: 'Voice-channel counters that display live server totals.', examples: ['/serverstats create', '/serverstats list', '/serverstats update', '/serverstats delete'] },
};

function bindModuleCommandControls(pageName, category) {
  const search = $('module-command-search');
  if (search) search.oninput = () => {
    const query = search.value.trim().toLowerCase();
    document.querySelectorAll('.module-access-row').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(query); });
  };
  document.querySelectorAll('[data-module-command]').forEach(toggle => { toggle.onchange = async () => {
    const enabled = toggle.checked; const command = toggle.dataset.moduleCommand; const row = toggle.closest('.module-access-row');
    toggle.disabled = true; row.classList.toggle('command-disabled', !enabled);
    try {
      await post('command', { command, enabled });
      toast(`/${command} ${enabled ? 'enabled' : 'disabled'}`);
      await load();
      void refreshRecentActivity();
    } catch (error) {
      toggle.checked = !enabled; row.classList.toggle('command-disabled', enabled);
      toast(`Couldn't update /${command}`, true, error.message);
    } finally { toggle.disabled = false; }
  }; });
}

function renderModulePage(pageName) {
  if (!state || !pageName.startsWith('module-')) return;
  const key = pageName.slice(7);
  const details = moduleDetails[key];
  const category = state.categories.find(item => item.key.toLowerCase() === key || item.name.toLowerCase().replaceAll(' ', '') === key);
  if (!details || !category) {
    $('module-page-content').innerHTML = '<article class="card module-detail-card"><h2>Module unavailable</h2><p>This module is not currently registered with DexzuBot.</p></article>';
    return;
  }
  const commands = category.commands || [];
  $('module-page-content').innerHTML = `<div class="feature-heading module-heading"><div><p class="eyebrow">${details.eyebrow}</p><h2>${details.label}</h2><p>${details.description}</p></div><span class="module-page-icon">${details.icon}</span></div><div class="module-page-grid"><article class="card module-detail-card ${category.enabled ? '' : 'module-disabled'}"><div class="card-head"><div><p class="eyebrow">MODULE ACCESS</p><h2>${details.label} Commands</h2><p>Changes apply instantly in Discord and are remembered after restarts.</p></div><label class="switch"><input id="module-page-toggle" type="checkbox" ${category.enabled ? 'checked' : ''} aria-label="Toggle ${details.label}"><span></span></label></div><div class="module-health"><div><small>Status</small><strong><i class="status-dot ${category.enabled ? 'good' : ''}"></i>${category.enabled ? 'Enabled' : 'Disabled'}</strong></div><div><small>Available commands</small><strong>${category.enabledCommands} / ${category.totalCommands}</strong></div></div><div class="module-progress"><i><b style="width:${category.totalCommands ? Math.round(category.enabledCommands / category.totalCommands * 100) : 0}%"></b></i><span>${category.enabledCommands} enabled</span></div><p class="module-disabled-note">Disabled modules are hidden from the help menu and their slash commands are removed from this server.</p></article><article class="card module-command-card"><p class="eyebrow">QUICK START</p><h2>Popular Commands</h2><p>Use these commands directly in Discord.</p><div class="module-command-list">${details.examples.map(command => `<code>${command}</code>`).join('')}</div></article></div><article class="card module-access-card"><div class="card-head"><div><p class="eyebrow">COMMAND ACCESS</p><h2>All ${details.label} Commands</h2><p>Enable or disable individual commands for this server.</p></div><span class="status-note">${commands.length} command paths</span></div><input id="module-command-search" class="search-input" type="search" placeholder="Search ${details.label.toLowerCase()} commands…"><div class="module-access-list">${commands.map(command => `<div class="module-access-row ${command.enabled && category.enabled ? '' : 'command-disabled'}"><div><code>/${escapeHtml(command.name)}</code><p>${escapeHtml(command.description)}</p>${command.protected ? '<small>Required command</small>' : ''}</div><label class="switch"><input data-module-command="${escapeHtml(command.name)}" type="checkbox" ${command.enabled && category.enabled ? 'checked' : ''} ${command.protected || !category.enabled ? 'disabled' : ''} aria-label="Toggle /${escapeHtml(command.name)}"><span></span></label></div>`).join('')}</div></article>`;
  const toggle = $('module-page-toggle');
  toggle.onchange = async () => {
    const enabled = toggle.checked; const card = toggle.closest('.module-detail-card');
    toggle.disabled = true; card.classList.toggle('module-disabled', !enabled);
    try {
      await post('category', { category: category.key, enabled });
      toast(`${details.label} ${enabled ? 'enabled' : 'disabled'}`);
      await load();
      void refreshRecentActivity();
    } catch (error) {
      toggle.checked = !enabled; card.classList.toggle('module-disabled', enabled);
      toast(`Couldn't update ${details.label}`, true, error.message);
    } finally { toggle.disabled = false; }
  };
  bindModuleCommandControls(pageName, category);
}

function showPage(pageName) {
  const selected = pageDetails[pageName] ? pageName : 'overview';
  const selectedPanel = selected.startsWith('module-') ? 'module' : selected;
  const currentPage = document.querySelector('[data-panel].active')?.dataset.panel;
  if (currentPage && currentPage !== selected && dirtyPages.has(currentPage)) {
    if (!confirm('Discard unsaved changes?')) return;
    dirtyPages.delete(currentPage);
    if (state) render(state);
  }
  document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === selectedPanel));
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === selected));
  requestAnimationFrame(updateNavIndicator);
  $('page-title').textContent = pageDetails[selected][0];
  $('breadcrumb-page').textContent = pageDetails[selected][0];
  $('page-description').textContent = pageDetails[selected][1];
  history.replaceState(null, '', `#${selected}`);
  renderModulePage(selected);
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
  $('safety-summary').innerHTML = [['Promotion Filter',$('promo-enabled').checked],['Mention Protection',pingCount > 0],['Anti Spam',$('spam-enabled').checked],['Mention Limit',$('mentions-enabled').checked]].map(([label,enabled]) => `<span><i class="status-dot ${enabled ? 'good' : ''}"></i>${label} <b>${enabled ? 'Enabled' : 'Disabled'}</b></span>`).join('');
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
function renderLevelRewards() {
  const rewards = [...levelRewardDraft].sort((a, b) => a.level - b.level);
  $('level-reward-count').textContent = `${rewards.length} configured`;
  $('level-reward-list').innerHTML = rewards.length ? rewards.map(reward => {
    const role = state.roles.find(item => item.id === reward.roleId);
    return `<div class="level-reward-row"><span>Level ${reward.level}</span><strong><i class="role-color" style="color:${escapeHtml(role?.color || '#99aab5')};background:${escapeHtml(role?.color || '#99aab5')}"></i>${escapeHtml(role?.name || 'Missing role')}</strong><button type="button" data-remove-level-reward="${reward.level}">Remove</button></div>`;
  }).join('') : '<div class="level-reward-empty">No level roles configured yet.</div>';
  document.querySelectorAll('[data-remove-level-reward]').forEach(button => { button.onclick = () => {
    levelRewardDraft = levelRewardDraft.filter(reward => reward.level !== Number(button.dataset.removeLevelReward));
    levelingRewardsDirty = true; setDirty('leveling', levelingSettingsDirty || levelingRewardsDirty); renderLevelRewards();
  }; });
}
function updateLoggingUi() {
  document.querySelectorAll('[data-group=logging]').forEach(input => input.closest('.check-row')?.classList.toggle('selected', input.checked));
  const checked = document.querySelectorAll('[data-group=logging]:checked').length;
  const total = document.querySelectorAll('[data-group=logging]').length;
  const searchQuery = $('logging-search').value.trim();
  const visible = [...document.querySelectorAll('[data-group=logging]')].filter(input => !input.closest('.check-row').hidden).length;
  $('logging-enabled-count').textContent = searchQuery ? `${visible} event${visible === 1 ? '' : 's'} found` : `${checked} / ${total} events enabled`;
  $('logging-bar-count').textContent = `${checked} events enabled`;
  const destination = channelName($('logging-channel').value);
  $('logging-summary').innerHTML = [['Logging', $('logging-enabled').checked ? 'Enabled' : 'Disabled'], ['Destination', `${destination === 'Not configured' ? '' : '#'}${destination}`], ['Events', `${checked} enabled`]].map(([label,value]) => `<article class="summary-card"><small>${label}</small><strong>${escapeHtml(value)}</strong></article>`).join('');
  document.querySelectorAll('.logging-group').forEach(group => { const all = group.querySelectorAll('[data-group=logging]').length; const on = group.querySelectorAll('[data-group=logging]:checked').length; group.querySelector('.group-count').textContent = `${on}/${all} enabled`; });
}

function relativeActivityTime(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function renderRecentActivity() {
  if (!state) return;
  const activities = Array.isArray(state.recentActivity) ? state.recentActivity : [];
  const visible = activities.slice(0, activityExpanded ? 20 : 5);
  $('view-logs').textContent = activities.length > 5 ? (activityExpanded ? 'Show less' : 'View all') : 'Up to date';
  $('view-logs').disabled = activities.length <= 5;
  if (!visible.length) {
    $('recent-activity').innerHTML = '<div class="empty-state"><span class="empty-icon">≡</span><strong>No recent activity</strong><p>New DexzuBot events will appear here.</p></div>';
    return;
  }
  const activityIcons = { moderation: '◆', message: '≡', member: '✦', voice: '◖', leveling: '↗', counting: '#', role: '◇', channel: '#', dashboard: '⌘', guild: '⌂', invite: '↗', emoji: '✦', sticker: '▣' };
  $('recent-activity').innerHTML = visible.map((activity, index) => `<div class="activity-row ${index === 0 && activity.id === latestActivityId ? 'activity-new' : ''}"><span class="activity-type ${escapeHtml(activity.category)}">${activityIcons[activity.category] || '•'}</span><div><strong>${escapeHtml(activity.title)}</strong>${activity.detail ? `<p>${escapeHtml(activity.detail)}</p>` : ''}</div><time datetime="${escapeHtml(activity.timestamp)}" title="${escapeHtml(new Date(activity.timestamp).toLocaleString())}">${relativeActivityTime(activity.timestamp)}</time></div>`).join('');
  if (latestActivityId) setTimeout(() => { document.querySelector('.activity-new')?.classList.remove('activity-new'); latestActivityId = null; }, 1100);
}

async function refreshRecentActivity() {
  if (!state) return;
  try {
    const response = await fetch('/dashboard/api/activity', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Activity unavailable');
    const previousTopId = state.recentActivity?.[0]?.id;
    state.recentActivity = data.activity;
    if (previousTopId && data.activity?.[0]?.id !== previousTopId) latestActivityId = data.activity[0].id;
    renderRecentActivity();
  } catch { /* Keep the last successfully loaded activity feed. */ }
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
$('sidebar-collapse').onclick = () => { setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed')); requestAnimationFrame(updateNavIndicator); };
$('view-logs').onclick = () => { activityExpanded = !activityExpanded; renderRecentActivity(); };

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
  const metricValues = { Members: current.server.members, Commands: current.bot.loadedCommands, Channels: current.server.channels };
  $('metrics').innerHTML = [['Members', metricValues.Members, `${current.server.members} total`], ['Commands', metricValues.Commands, `${current.bot.loadedCommands} loaded`], ['Channels', metricValues.Channels, 'Server total'], ['Uptime', `${uptimeHours}h`, 'Since restart']].map(([key, value, secondary]) => `<div class="metric"><div class="metric-icon">${metricIcons[key]}</div><strong data-metric="${key}">${key === 'Uptime' ? value : (previousMetricValues?.[key] ?? (hasAnimatedStats ? value : 0))}</strong><span>${key}</span><small>${secondary}</small></div>`).join('');
  for (const [key, value] of Object.entries(metricValues)) animateNumber(document.querySelector(`[data-metric="${key}"]`), previousMetricValues?.[key] ?? (hasAnimatedStats ? value : 0), value, hasAnimatedStats ? 190 : 650);
  previousMetricValues = metricValues;
  hasAnimatedStats = true;
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
  ].map(([label, value, status], index) => `<div class="status-row status-updated" style="--row-delay:${index * 30}ms"><span>${label}</span><strong><i class="status-dot ${status}"></i>${value}</strong></div>`).join('');
  const performanceRows = [
    ['Uptime', `${uptimeHours}h ${Math.floor((current.bot.uptimeSeconds % 3600) / 60)}m`, Math.min(100, current.bot.uptimeSeconds / 864)],
    ['Commands loaded', current.bot.loadedCommands, Math.min(100, current.bot.loadedCommands)],
  ];
  $('performance').innerHTML = performanceRows.map(([label, value]) => `<div class="performance-row"><div><span>${label}</span><strong class="live-value">${value}</strong></div><i><b data-performance="${escapeHtml(label)}" style="width:${previousPerformanceValues?.[label] ?? 0}%"></b></i></div>`).join('');
  requestAnimationFrame(() => performanceRows.forEach(([label,,meter]) => { const bar = document.querySelector(`[data-performance="${label}"]`); if (bar) bar.style.width = `${meter}%`; }));
  previousPerformanceValues = Object.fromEntries(performanceRows.map(([label,,meter]) => [label, meter]));
  renderRecentActivity();
  document.querySelectorAll('[data-category]').forEach(element => { element.onchange = async () => {
    const row = element.closest('.toggle-row'); const enabled = element.checked; const name = element.dataset.name;
    row.classList.toggle('module-disabled', !enabled); row.classList.add('module-updating'); element.disabled = true;
    try { await post('category', { category: element.dataset.category, enabled }); row.classList.add('module-flash'); setTimeout(() => row.classList.remove('module-flash'), 500); toast(`${name} ${enabled ? 'enabled' : 'disabled'}`, false, `${name} commands are now ${enabled ? 'active' : 'inactive'}.`); await load(); void refreshRecentActivity(); }
    catch (error) { element.checked = !enabled; row.classList.toggle('module-disabled', enabled); toast(`Couldn't update ${name}.`, true, error.message); }
    finally { row.classList.remove('module-updating'); element.disabled = false; }
  }; });
  $('promo-enabled').checked = current.antiPromo.enabled;
  $('promo-channels').innerHTML = current.channels.map(channel => checkbox(channel.id, `#${channel.name}`, current.antiPromo.allowedChannelIds.includes(channel.id), 'promo')).join('');
  $('ping-owners').innerHTML = current.owners.map(owner => `<label class="check-row owner-row"><input type="checkbox" data-group="ping" value="${owner.id}" ${current.antiPing.protectedUserIds.includes(owner.id) ? 'checked' : ''}><span class="owner-avatar">${owner.avatar ? `<img src="${escapeHtml(owner.avatar)}" alt="">` : '@'}</span><span><b>${escapeHtml(owner.name)}</b><small>Protected from direct mentions</small></span></label>`).join('');
  $('spam-enabled').checked = current.safetyAdvanced.antiSpam;
  $('spam-max').value = current.safetyAdvanced.spamMaxMessages;
  $('spam-seconds').value = current.safetyAdvanced.spamIntervalSeconds;
  $('mentions-enabled').checked = current.safetyAdvanced.antiMassMentions;
  $('mentions-max').value = current.safetyAdvanced.maxMentions;
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
  levelRewardDraft = current.leveling.roleRewards.map(reward => ({ ...reward }));
  $('level-reward-role').innerHTML = `<option value="">Choose a role</option>${current.roles.map(role => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('')}`;
  renderLevelRewards();
  $('logging-enabled').checked = current.logging.enabled;
  $('logging-channel').innerHTML = channelOptions(current.channels, current.logging.channelId, 'Choose a log channel');
  const logGroups = { Moderation: [], Messages: [], Voice: [], Members: [], Channels: [], Server: [] };
  current.logging.events.forEach(event => {
    const prefix = event.key.split('.')[0];
    const group = prefix === 'moderation' ? 'Moderation' : prefix === 'message' ? 'Messages' : prefix === 'voice' ? 'Voice' : prefix === 'member' ? 'Members' : prefix === 'channel' ? 'Channels' : 'Server';
    logGroups[group].push(event);
  });
  const loggingIcons = { Moderation: '◆', Messages: '≡', Voice: '◖', Members: '✦', Channels: '#', Server: '▣' };
  let collapsedLoggingGroups = {};
  try { collapsedLoggingGroups = JSON.parse(localStorage.getItem('dexzu-logging-collapsed') || '{}'); } catch { /* Ignore invalid local preferences. */ }
  const renderLoggingGroup = group => {
    const events = logGroups[group];
    if (!events?.length) return '';
    const open = collapsedLoggingGroups[group] !== true;
    return `<details class="logging-group" data-log-group="${group}" ${open ? 'open' : ''}><summary><span class="group-title"><i>${loggingIcons[group]}</i><span>${group}</span></span><b class="group-count">${events.filter(event => event.enabled).length} / ${events.length} enabled</b></summary><div class="group-body"><div class="group-actions"><button type="button" data-log-action="on">Enable All</button><button type="button" data-log-action="off">Disable All</button></div><div class="group-events">${events.map(event => checkbox(event.key, event.label, event.enabled, 'logging')).join('')}</div></div></details>`;
  };
  const leftGroups = ['Moderation', 'Channels', 'Voice'];
  const rightGroups = ['Messages', 'Members', 'Server'];
  $('logging-events').innerHTML = `<div class="logging-column">${leftGroups.map(renderLoggingGroup).join('')}</div><div class="logging-column">${rightGroups.map(renderLoggingGroup).join('')}</div>`;
  $('youtube-enabled').checked = current.youtube.enabled;
  $('youtube-channel').innerHTML = channelOptions(current.channels, current.youtube.channelId, 'Choose a channel');
  $('youtube-preview-avatar').src = current.bot.avatar;
  updateSafetyUi(); updateGreetingUi(); validateLeveling(); updateLoggingUi();
  safetyPromoDirty = false; safetyPingDirty = false; safetyAdvancedDirty = false; levelingSettingsDirty = false; levelingRewardsDirty = false;
  ['safety','greetings','leveling','logging'].forEach(page => setDirty(page, false));
  bindControlEvents();
  updateYouTubeSummary();
  renderYouTubeLatest();
  renderModulePage(location.hash.slice(1));
}

function selectedYouTubeChannel() {
  return state?.channels.find(channel => channel.id === $('youtube-channel').value) || null;
}

function bindControlEvents() {
  const bind = (ids, page, update) => ids.forEach(id => { const element = $(id); element.oninput = element.onchange = () => { setDirty(page); update?.(); }; });
  $('promo-enabled').onchange = () => { safetyPromoDirty = true; setDirty('safety'); updateSafetyUi(); };
  document.querySelectorAll('[data-group=promo],[data-group=ping]').forEach(input => { input.onchange = () => { if (input.dataset.group === 'promo') safetyPromoDirty = true; else safetyPingDirty = true; setDirty('safety'); updateSafetyUi(); input.closest('.check-row')?.classList.toggle('selected', input.checked); }; input.closest('.check-row')?.classList.toggle('selected', input.checked); });
  $('promo-search').oninput = () => { const query = $('promo-search').value.trim().toLowerCase(); document.querySelectorAll('[data-group=promo]').forEach(input => { input.closest('.check-row').hidden = !input.closest('.check-row').textContent.toLowerCase().includes(query); }); };
  ['spam-enabled','spam-max','spam-seconds','mentions-enabled','mentions-max'].forEach(id => { $(id).oninput = $(id).onchange = () => { safetyAdvancedDirty = true; setDirty('safety'); updateSafetyUi(); }; });
  bind(['greeting-cards','welcome-enabled','welcome-channel','welcome-message','goodbye-enabled','goodbye-channel','goodbye-message'], 'greetings', updateGreetingUi);
  ['leveling-enabled','leveling-announce','leveling-channel','leveling-xp-min','leveling-xp-max','leveling-cooldown','leveling-multiplier'].forEach(id => { $(id).oninput = $(id).onchange = () => { levelingSettingsDirty = true; setDirty('leveling'); validateLeveling(); }; });
  bind(['logging-enabled','logging-channel'], 'logging', updateLoggingUi);
  document.querySelectorAll('[data-group=logging]').forEach(input => { input.onchange = () => { setDirty('logging'); updateLoggingUi(); }; });
  document.querySelectorAll('[data-log-action]').forEach(button => { button.onclick = () => { button.closest('.logging-group').querySelectorAll('[data-group=logging]').forEach(input => { input.checked = button.dataset.logAction === 'on'; }); setDirty('logging'); updateLoggingUi(); }; });
  document.querySelectorAll('.logging-group').forEach(group => { group.ontoggle = () => { if ($('logging-search').value.trim()) return; let collapsed = {}; try { collapsed = JSON.parse(localStorage.getItem('dexzu-logging-collapsed') || '{}'); } catch { /* Replace invalid local preferences. */ } collapsed[group.dataset.logGroup] = !group.open; localStorage.setItem('dexzu-logging-collapsed', JSON.stringify(collapsed)); }; });
  $('logging-all').onclick = () => { document.querySelectorAll('[data-group=logging]').forEach(input => { input.checked = true; }); setDirty('logging'); updateLoggingUi(); };
  $('logging-none').onclick = () => { document.querySelectorAll('[data-group=logging]').forEach(input => { input.checked = false; }); setDirty('logging'); updateLoggingUi(); };
  $('logging-search').oninput = () => { const query = $('logging-search').value.trim().toLowerCase(); document.querySelectorAll('.logging-group').forEach(group => { let visible = 0; group.querySelectorAll('.check-row').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(query); if (!row.hidden) visible += 1; }); group.hidden = visible === 0; if (query && visible) group.open = true; }); updateLoggingUi(); };
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
    ...(state.youtube.lastCheckedAt ? [['Last feed check', new Date(state.youtube.lastCheckedAt).toLocaleString(), state.youtube.lastError ? 'warning' : 'good']] : []),
    ...(state.youtube.lastPostedAt ? [['Last notification', new Date(state.youtube.lastPostedAt).toLocaleString(), 'good']] : []),
    ...(state.youtube.lastError ? [['Alert health', state.youtube.lastError, 'bad']] : [['Alert health', 'Healthy', 'good']]),
  ].map(([label, value, status]) => `<div class="status-row"><span>${escapeHtml(label)}</span><strong><i class="status-dot ${status}"></i>${escapeHtml(value)}</strong></div>`).join('');
}

function renderYouTubeNotifications() {
  const container = $('youtube-notifications');
  const deliveries = state?.youtube?.deliveries || [];
  if (!deliveries.length) {
    container.className = 'youtube-empty compact';
    container.innerHTML = '<span>≡</span><strong>No notifications yet</strong><p>New DexzuGtag upload notifications will appear here.</p>';
    return;
  }
  container.className = 'youtube-notification-list';
  container.innerHTML = deliveries.map(delivery => `<a class="notification-item" href="${escapeHtml(delivery.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(delivery.thumbnailUrl)}" alt=""><span><strong>${escapeHtml(delivery.title)}</strong><small>${escapeHtml(new Date(delivery.sentAt || delivery.detectedAt).toLocaleString())} · ${delivery.attempts || 1} attempt${delivery.attempts === 1 ? '' : 's'}</small><em class="delivery-${escapeHtml(delivery.status)}">${escapeHtml(delivery.status)}</em></span></a>`).join('');
}

function renderYouTubeLatest() {
  if (!state) return;
  renderYouTubeNotifications();
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
  catch (error) { button.classList.add('refresh-failed'); setTimeout(() => button.classList.remove('refresh-failed'), 350); toast(error.message, true); }
  finally { button.classList.remove('loading'); button.disabled = false; }
};

$('save-promo').onclick = async () => { try { const allowedChannelIds = [...document.querySelectorAll('[data-group=promo]:checked')].map(input => input.value); await post('anti-promo', { enabled: $('promo-enabled').checked, allowedChannelIds }); state.antiPromo = { enabled: $('promo-enabled').checked, allowedChannelIds }; safetyPromoDirty = false; setDirty('safety', safetyPingDirty || safetyAdvancedDirty); showSaved($('save-promo')); toast('Promotion filter saved'); } catch (error) { toast("Couldn't save promotion filter", true, error.message); } };
$('save-ping').onclick = async () => { try { const protectedUserIds = [...document.querySelectorAll('[data-group=ping]:checked')].map(input => input.value); await post('anti-ping', { protectedUserIds }); state.antiPing.protectedUserIds = protectedUserIds; safetyPingDirty = false; setDirty('safety', safetyPromoDirty || safetyAdvancedDirty); showSaved($('save-ping')); toast('Mention protection saved'); } catch (error) { toast("Couldn't save mention protection", true, error.message); } };
$('save-safety-advanced').onclick = async () => { const settings = { antiSpam: $('spam-enabled').checked, spamMaxMessages: Number($('spam-max').value), spamIntervalSeconds: Number($('spam-seconds').value), antiMassMentions: $('mentions-enabled').checked, maxMentions: Number($('mentions-max').value) }; try { await post('safety/advanced', settings); state.safetyAdvanced = settings; safetyAdvancedDirty = false; setDirty('safety', safetyPromoDirty || safetyPingDirty); showSaved($('save-safety-advanced'), '✓ Save Advanced Safety'); toast('Advanced safety settings saved'); } catch (error) { toast("Couldn't save advanced safety settings", true, error.message); } };
$('save-greetings').onclick = async () => { try { const settings = { cardEnabled: $('greeting-cards').checked, welcomeEnabled: $('welcome-enabled').checked, welcomeChannelId: $('welcome-channel').value, welcomeMessage: $('welcome-message').value, goodbyeEnabled: $('goodbye-enabled').checked, goodbyeChannelId: $('goodbye-channel').value, goodbyeMessage: $('goodbye-message').value }; await post('greetings', settings); state.greetings = { ...state.greetings, ...settings }; setDirty('greetings', false); showSaved($('save-greetings')); toast('Greeting settings saved'); } catch (error) { toast("Couldn't save greeting settings", true, error.message); } };
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
    state.leveling = { ...state.leveling, ...settings }; levelingSettingsDirty = false; setDirty('leveling', levelingRewardsDirty);
    showSaved(button);
    toast('Leveling settings saved');
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = '✓ Save Changes';
  }
};
$('add-level-reward').onclick = () => {
  const level = Number($('level-reward-level').value);
  const roleId = $('level-reward-role').value;
  let error = '';
  if (!Number.isInteger(level) || level < 1 || level > 500) error = 'Choose a whole level from 1 to 500.';
  else if (!roleId) error = 'Choose a role to award.';
  else if (levelRewardDraft.some(reward => reward.level === level)) error = `Level ${level} already has a reward. Remove it first to replace it.`;
  else if (levelRewardDraft.length >= 25) error = 'You can configure up to 25 level role rewards.';
  $('level-reward-error').textContent = error;
  if (error) return;
  levelRewardDraft.push({ level, roleId });
  $('level-reward-level').value = '';
  $('level-reward-role').value = '';
  levelingRewardsDirty = true; setDirty('leveling'); renderLevelRewards();
};
$('save-level-rewards').onclick = async () => {
  const button = $('save-level-rewards'); button.disabled = true;
  try {
    const result = await post('leveling/rewards', { roleRewards: levelRewardDraft });
    state.leveling.roleRewards = levelRewardDraft.map(reward => ({ ...reward }));
    levelingRewardsDirty = false; setDirty('leveling', levelingSettingsDirty);
    showSaved(button, '✓ Save Role Rewards');
    toast('Level role rewards saved', false, result.rolesAwarded ? `${result.rolesAwarded} existing role assignment${result.rolesAwarded === 1 ? '' : 's'} added.` : 'New rewards apply automatically.');
  } catch (error) { toast("Couldn't save level role rewards", true, error.message); }
  finally { button.disabled = false; }
};
$('reset-leveling').onclick = async () => { if (!confirm(`Reset all XP?\n\nThis will permanently reset XP and levels for every member in ${state.server.name}. This action cannot be undone.`)) return; const confirmation = prompt(`Type ${state.server.name} to confirm the reset:`); if (confirmation === null) return; try { const result = await post('leveling/reset', { confirm: confirmation }); toast(`Reset XP for ${result.resetCount} members`); } catch (error) { toast(error.message, true); } };
$('save-logging').onclick = async () => { try { const enabledEventTypes = [...document.querySelectorAll('[data-group=logging]:checked')].map(input => input.value); const enabled = $('logging-enabled').checked; const channelId = $('logging-channel').value; await post('logging', { enabled, channelId, enabledEventTypes }); state.logging.enabled = enabled; state.logging.channelId = channelId; state.logging.events.forEach(event => { event.enabled = enabledEventTypes.includes(event.key); }); setDirty('logging', false); showSaved($('save-logging')); toast('Logging settings saved'); } catch (error) { toast("Couldn't save logging settings", true, error.message); } };
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
    showSaved(button);
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
setInterval(() => { if (!document.hidden) void refreshRecentActivity(); }, 30000);
window.addEventListener('resize', updateNavIndicator, { passive: true });
document.querySelector('.sidebar')?.addEventListener('scroll', updateNavIndicator, { passive: true });

document.addEventListener('pointermove', event => {
  const card = event.target.closest?.('.card');
  if (!card || card.classList.contains('danger-card') || reducedMotion()) return;
  const bounds = card.getBoundingClientRect();
  card.classList.add('mouse-light');
  card.style.setProperty('--card-x', `${event.clientX - bounds.left}px`);
  card.style.setProperty('--card-y', `${event.clientY - bounds.top}px`);
}, { passive: true });
document.addEventListener('pointerout', event => {
  const card = event.target.closest?.('.card');
  if (card && !card.contains(event.relatedTarget)) card.classList.remove('mouse-light');
}, { passive: true });

function setupBackgroundParallax() {
  const connection = navigator.connection;
  if (reducedMotion() || matchMedia('(pointer: coarse)').matches || connection?.saveData || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)) return;
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0, running = false;
  const tick = () => {
    currentX += (targetX - currentX) * .08; currentY += (targetY - currentY) * .08;
    document.documentElement.style.setProperty('--parallax-x', `${currentX.toFixed(2)}px`);
    document.documentElement.style.setProperty('--parallax-y', `${currentY.toFixed(2)}px`);
    if (Math.abs(targetX - currentX) > .03 || Math.abs(targetY - currentY) > .03) requestAnimationFrame(tick); else running = false;
  };
  window.addEventListener('pointermove', event => {
    targetX = ((event.clientX / innerWidth) - .5) * 8; targetY = ((event.clientY / innerHeight) - .5) * 8;
    if (!running) { running = true; requestAnimationFrame(tick); }
  }, { passive: true });
}
setupBackgroundParallax();
if (!reducedMotion() && (!location.hash || location.hash === '#overview')) { document.body.classList.add('initializing'); setTimeout(() => document.body.classList.remove('initializing'), 1300); }
window.addEventListener('beforeunload', event => { if (!dirtyPages.size) return; event.preventDefault(); event.returnValue = ''; });
