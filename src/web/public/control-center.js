// Presentation and navigation only; all writes stay in the existing controls.
(() => {
  const dialog = $('control-search-dialog');
  const input = $('control-search-input');
  const results = $('control-search-results');
  const destinations = [...document.querySelectorAll('#dashboard-navigation [data-page]')];

  function renderResults() {
    const query = input.value.trim().toLowerCase();
    const matches = destinations.filter(button => {
      const details = pageDetails[button.dataset.page];
      return `${button.title} ${details?.join(' ')}`.toLowerCase().includes(query);
    });
    results.replaceChildren();
    for (const destination of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      const label = document.createElement('strong');
      label.textContent = destination.title;
      const description = document.createElement('span');
      description.textContent = pageDetails[destination.dataset.page][1];
      button.append(label, description);
      button.addEventListener('click', () => {
        dialog.close();
        destination.click();
        $('dashboard-main').focus({ preventScroll: true });
      });
      results.append(button);
    }
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = 'No matching controls. Try “tickets”, “safety”, or “leveling”.';
      results.append(empty);
    }
  }

  function openSearch() {
    if (dialog.open) return;
    input.value = '';
    renderResults();
    dialog.showModal();
    input.focus();
  }
  $('open-control-search').addEventListener('click', openSearch);
  $('close-control-search').addEventListener('click', () => dialog.close());
  input.addEventListener('input', renderResults);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus(); }
    if (event.key === 'Enter') { event.preventDefault(); results.querySelector('button')?.click(); }
  });
  document.addEventListener('keydown', event => {
    // Search inputs consume Escape to clear their text in Chromium.
    if (event.key === 'Escape' && dialog.open) {
      event.preventDefault(); dialog.close(); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); openSearch();
    }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('dexzu-state', event => {
    const { bot } = event.detail;
    $('hero-bot-avatar').src = bot.avatar;
    $('hero-connection').textContent = bot.online
      ? (bot.latencyMs == null ? 'Connected to your community' : `Connected with ${bot.latencyMs} ms latency`)
      : 'Disconnected from Discord';
    $('hero-uptime').textContent = `${Math.floor(bot.uptimeSeconds / 3600)}h ${Math.floor(bot.uptimeSeconds % 3600 / 60)}m`;
    $('hero-memory').textContent = bot.memoryMb == null ? '—' : `${bot.memoryMb} MB`;
    $('hero-api').textContent = bot.online ? 'Connected' : 'Offline';
    $('hero-api').classList.toggle('connected', bot.online);
    $('hero-api').classList.toggle('disconnected', !bot.online);
  });
})();
