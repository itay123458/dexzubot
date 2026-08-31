let state;
const $ = id => document.getElementById(id);
const toast = (message, error = false) => {
  const element = $('toast');
  element.textContent = message;
  element.className = error ? 'show error' : 'show';
  setTimeout(() => { element.className = ''; }, 2600);
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

function render(current) {
  state = current;
  $('bot-avatar').src = current.bot.avatar;
  $('server-name').textContent = current.server.name;
  $('online-pill').textContent = current.bot.online ? 'Online' : 'Offline';
  $('online-pill').className = `pill ${current.bot.online ? 'online' : ''}`;
  $('metrics').innerHTML = [['Members', current.server.members], ['Command modules', current.bot.loadedCommands], ['Channels', current.server.channels], ['Uptime', `${Math.floor(current.bot.uptimeSeconds / 3600)}h`]].map(([key, value]) => `<div class="metric"><strong>${value}</strong><span>${key}</span></div>`).join('');
  $('categories').innerHTML = current.categories.map(category => `<div class="toggle-row"><div><strong>${category.name}</strong><small>${category.enabledCommands}/${category.totalCommands} paths enabled</small></div><label class="switch"><input data-category="${category.key}" type="checkbox" ${category.enabled ? 'checked' : ''}><span></span></label></div>`).join('');
  document.querySelectorAll('[data-category]').forEach(element => { element.onchange = async () => { try { await post('category', { category: element.dataset.category, enabled: element.checked }); toast(`${element.dataset.category} updated`); await load(); } catch (error) { element.checked = !element.checked; toast(error.message, true); } }; });
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

$('save-promo').onclick = async () => { try { await post('anti-promo', { enabled: $('promo-enabled').checked, allowedChannelIds: [...document.querySelectorAll('[data-group=promo]:checked')].map(input => input.value) }); toast('Anti-promo saved'); await load(); } catch (error) { toast(error.message, true); } };
$('save-ping').onclick = async () => { try { await post('anti-ping', { protectedUserIds: [...document.querySelectorAll('[data-group=ping]:checked')].map(input => input.value) }); toast('Anti-ping saved'); await load(); } catch (error) { toast(error.message, true); } };
$('save-greetings').onclick = async () => { try { await post('greetings', { cardEnabled: $('greeting-cards').checked, welcomeEnabled: $('welcome-enabled').checked, welcomeChannelId: $('welcome-channel').value, welcomeMessage: $('welcome-message').value, goodbyeEnabled: $('goodbye-enabled').checked, goodbyeChannelId: $('goodbye-channel').value, goodbyeMessage: $('goodbye-message').value }); toast('Greeting settings saved'); await load(); } catch (error) { toast(error.message, true); } };
$('save-leveling').onclick = async () => {
  const button = $('save-leveling');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Saving…';
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
