// Session presentation is advisory; every public API request is authorized on the server.
(() => {
  const element = id => document.getElementById(id);
  const card = element('dashboard-access');
  const status = element('dashboard-access-status');
  const sessionStatus = element('dashboard-session-status');
  let session;
  let readOnly = false;
  let accessRequest = 0;
  const readControls = '[data-page], [data-workspace], #mobile-navigation, #open-control-search, #control-search-dialog *, #refresh-dashboard, #view-logs, #refresh-roles, #community-refresh, #role-edit-selected, #dashboard-logout, input[type="search"], .toast-close';

  async function request(path, body) {
    const response = await fetch(`/dashboard/auth/${path}`, {
      credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (response.status === 401) {
      location.assign('/dashboard/auth/login');
      throw new Error('Your session ended. Sign in again.');
    }
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The request failed. Try again.');
    return result;
  }

  function lockControls() {
    if (!readOnly) return;
    document.querySelectorAll('button,input,select,textarea').forEach(control => {
      if (control.matches(readControls) || control.closest('#dashboard-access')) return;
      if (!control.disabled) control.disabled = true;
      if (control.title !== 'Read-only dashboard access') control.title = 'Read-only dashboard access';
    });
  }
  // Existing page renderers can replace controls or enable them after polling.
  const observer = new MutationObserver(lockControls);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  for (const type of ['click', 'submit', 'change']) {
    document.addEventListener(type, event => {
      if (!readOnly) return;
      const control = event.target.closest('button,input,select,textarea,form');
      if (!control || control.matches(readControls) || control.closest('#dashboard-access')) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
  }

  function clearLink() {
    element('dashboard-invite-link').value = '';
    element('dashboard-invite-result').hidden = true;
  }
  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'unknown date' : date.toLocaleString();
  }
  function renderList(id, entries, invitation) {
    const list = element(id);
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.textContent = invitation ? 'No pending invitations.' : 'No invited accounts have active access.';
      list.append(empty);
    }
    for (const entry of entries) {
      const row = document.createElement('li');
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${entry.userId} · ${entry.workspace === 'beta' ? 'Beta' : 'Main'} · ${entry.role}`;
      const detail = document.createElement('span');
      detail.textContent = invitation ? `Link expires ${dateLabel(entry.expiresAt)}` : `Access granted ${dateLabel(entry.createdAt)}`;
      copy.append(title, detail);
      const revoke = document.createElement('button');
      revoke.type = 'button'; revoke.className = 'secondary-button'; revoke.textContent = 'Revoke';
      revoke.setAttribute('aria-label', `Revoke ${invitation ? 'invitation' : 'access'} for ${entry.userId} in ${entry.workspace}`);
      revoke.addEventListener('click', async () => {
        if (!confirm(`Revoke ${entry.role} ${invitation ? 'invitation' : 'access'} for Discord account ${entry.userId} in ${entry.workspace}? ${invitation ? 'This invitation link will stop working.' : 'Their access to this workspace will end immediately.'}`)) return;
        revoke.disabled = true; status.textContent = 'Revoking…';
        try {
          await request('access/revoke', { id: entry.id });
          clearLink(); await loadAccess(); status.textContent = 'Revoked.';
        } catch (error) { status.textContent = error.message; revoke.disabled = false; }
      });
      row.append(copy, revoke); list.append(row);
    }
  }
  async function loadAccess() {
    const current = ++accessRequest;
    const result = await request('access');
    if (current !== accessRequest) return;
    renderList('dashboard-grants-list', result.grants, false);
    renderList('dashboard-invites-list', result.invites.filter(invite => invite.status === 'active' && new Date(invite.expiresAt).getTime() > Date.now()), true);
  }
  element('dashboard-invite-workspace').value = document.body.dataset.workspace === 'beta' ? 'beta' : 'main';
  element('dashboard-invite-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!session?.owner) return;
    const fields = element('dashboard-invite-fields');
    clearLink(); fields.disabled = true; status.textContent = 'Creating invitation…';
    try {
      const result = await request('access/invites', {
        userId: element('dashboard-invite-user').value.trim(),
        workspace: element('dashboard-invite-workspace').value,
        role: element('dashboard-invite-role').value,
        hours: Number(element('dashboard-invite-hours').value),
      });
      const url = new URL(result.url);
      if (url.protocol !== 'https:') throw new Error('The invitation URL is not secure. Check the public dashboard configuration.');
      element('dashboard-invite-link').value = url.href;
      element('dashboard-invite-result').hidden = false;
      status.textContent = 'Invitation created. Copy the link and send it to the recipient.';
      element('dashboard-invite-link').focus();
      try { await loadAccess(); } catch { status.textContent += ' The access list could not refresh. Use Refresh access.'; }
    } catch (error) { status.textContent = error.message; }
    finally { fields.disabled = false; }
  });
  element('dashboard-invite-clear').addEventListener('click', () => { clearLink(); status.textContent = 'Link cleared from this page. The invitation remains valid until expiry or revocation.'; });
  element('dashboard-invite-copy').addEventListener('click', async () => {
    const link = element('dashboard-invite-link');
    if (!link.value) return;
    try { await navigator.clipboard.writeText(link.value); status.textContent = 'Invitation link copied.'; }
    catch { link.focus(); link.select(); status.textContent = 'Copy is unavailable. The link is selected; copy it manually.'; }
  });
  element('dashboard-access-refresh').addEventListener('click', async event => {
    event.currentTarget.disabled = true; status.textContent = 'Refreshing access…';
    try { await loadAccess(); status.textContent = 'Access list updated.'; }
    catch (error) { status.textContent = error.message; }
    finally { element('dashboard-access-refresh').disabled = false; }
  });
  element('dashboard-logout').addEventListener('click', async event => {
    event.currentTarget.disabled = true; sessionStatus.textContent = 'Logging out…';
    try { await request('logout', {}); clearLink(); location.assign('/dashboard/auth/login'); }
    catch (error) { sessionStatus.textContent = error.message; element('dashboard-logout').disabled = false; }
  });
  window.addEventListener('pagehide', clearLink);
  async function start() {
    try {
      session = await request('session');
      if (session.public) {
        const grant = session.grants?.find(item => item.workspace === document.body.dataset.workspace);
        readOnly = !session.owner && grant?.role !== 'manager';
        element('dashboard-session').hidden = false;
        element('dashboard-logout').hidden = false;
        element('dashboard-session-label').textContent = `${session.user?.username || 'Discord account'} · ${session.owner ? 'Owner' : readOnly ? 'Viewer — read only' : 'Manager'}`;
        document.querySelector('.sidebar-footer small').textContent = 'Invite-only dashboard';
      }
      lockControls();
      if (session.owner) {
        card.hidden = false; status.textContent = 'Loading access…';
        try { await loadAccess(); status.textContent = ''; }
        catch (error) { status.textContent = error.message; }
      }
    } catch (error) {
      readOnly = true; lockControls();
      element('dashboard-session').hidden = false;
      sessionStatus.textContent = `Access could not be verified. Controls are read only. ${error.message}`;
    }
  }
  void start();
})();
