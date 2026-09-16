// Each document has one immutable server context, including polling and downloads.
// Switching navigates to a fresh document so drafts and in-flight responses cannot cross servers.
const workspaceParams = new URLSearchParams(location.search).getAll('workspace');
const dashboardWorkspace = workspaceParams.length > 1 ? 'invalid' : (workspaceParams[0] ?? 'main');
const dashboardApiUrl = path => `/dashboard/api/${path}${dashboardWorkspace === 'main' ? '' : `?workspace=${encodeURIComponent(dashboardWorkspace)}`}`;

document.body.dataset.workspace = dashboardWorkspace;
document.title = `DexzuBot ${dashboardWorkspace === 'beta' ? 'Beta' : 'Control'} Center`;
const workspaceNotice = document.getElementById('workspace-notice');
workspaceNotice.hidden = dashboardWorkspace !== 'beta';
document.getElementById('workspace-label').textContent = dashboardWorkspace === 'beta' ? 'Managing beta server' : 'Currently managing';
document.getElementById('config-export').href = dashboardApiUrl('operations/export');
for (const link of document.querySelectorAll('a[data-workspace]')) {
  if (link.dataset.workspace === dashboardWorkspace) link.setAttribute('aria-current', 'page');
  link.addEventListener('click', event => {
    if (link.getAttribute('aria-disabled') === 'true' || link.dataset.workspace === dashboardWorkspace) event.preventDefault();
    else if (pendingDashboardWrites > 0) {
      event.preventDefault();
      toast('Wait for the current save to finish before switching servers.', 'info');
    }
  });
}
window.addEventListener('dexzu-state', event => {
  for (const link of document.querySelectorAll('a[data-workspace]')) {
    const available = event.detail.workspace.available.includes(link.dataset.workspace);
    link.setAttribute('aria-disabled', String(!available));
    link.title = available ? `Manage the ${link.dataset.workspace} server` : 'This server is unavailable';
  }
});
