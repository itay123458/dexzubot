let state;
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
  document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === selected));
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === selected));
  $('page-title').textContent = pageDetails[selected][0];
  $('breadcrumb-page').textContent = pageDetails[selected][0];
  $('page-description').textContent = pageDetails[selected][1];
  history.replaceState(null, '', `#${selected}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  $('ping-owners').innerHTML = current.owners.map(owner => checkbox(owner.id, owner.name, current.antiPing.protectedUserIds.includes(owner.id), 'ping')).join('');
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
  $('logging-events').innerHTML = current.logging.events.map(event => checkbox(event.key, event.label, event.enabled, 'logging')).join('');
  $('youtube-enabled').checked = current.youtube.enabled;
  $('youtube-channel').innerHTML = channelOptions(current.channels, current.youtube.channelId, 'Choose a channel');
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

$('save-promo').onclick = async () => { try { await post('anti-promo', { enabled: $('promo-enabled').checked, allowedChannelIds: [...document.querySelectorAll('[data-group=promo]:checked')].map(input => input.value) }); toast('Anti-promo saved'); await load(); } catch (error) { toast(error.message, true); } };
$('save-ping').onclick = async () => { try { await post('anti-ping', { protectedUserIds: [...document.querySelectorAll('[data-group=ping]:checked')].map(input => input.value) }); toast('Anti-ping saved'); await load(); } catch (error) { toast(error.message, true); } };
$('save-greetings').onclick = async () => { try { await post('greetings', { cardEnabled: $('greeting-cards').checked, welcomeEnabled: $('welcome-enabled').checked, welcomeChannelId: $('welcome-channel').value, welcomeMessage: $('welcome-message').value, goodbyeEnabled: $('goodbye-enabled').checked, goodbyeChannelId: $('goodbye-channel').value, goodbyeMessage: $('goodbye-message').value }); toast('Greeting settings saved'); await load(); } catch (error) { toast(error.message, true); } };
$('save-leveling').onclick = async () => {
  const button = $('save-leveling');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    await post('leveling', {
      enabled: $('leveling-enabled').checked,
      announceLevelUp: $('leveling-announce').checked,
      channelId: $('leveling-channel').value,
      xpMin: Number($('leveling-xp-min').value),
      xpMax: Number($('leveling-xp-max').value),
      cooldown: Number($('leveling-cooldown').value),
      multiplier: Number($('leveling-multiplier').value),
    });
    toast('Leveling settings saved');
    await load();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Save leveling settings';
  }
};
$('reset-leveling').onclick = async () => { const confirmation = prompt(`Type ${state.server.name} to reset every member's XP and level:`); if (confirmation === null) return; try { const result = await post('leveling/reset', { confirm: confirmation }); toast(`Reset XP for ${result.resetCount} members`); } catch (error) { toast(error.message, true); } };
$('save-logging').onclick = async () => { try { await post('logging', { enabled: $('logging-enabled').checked, channelId: $('logging-channel').value, enabledEventTypes: [...document.querySelectorAll('[data-group=logging]:checked')].map(input => input.value) }); toast('Logging settings saved'); await load(); } catch (error) { toast(error.message, true); } };
$('save-youtube').onclick = async () => { try { await post('youtube', { enabled: $('youtube-enabled').checked, channelId: $('youtube-channel').value }); toast('YouTube alerts saved'); await load(); } catch (error) { toast(error.message, true); } };
load().catch(error => toast(error.message, true));
