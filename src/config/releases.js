export const betaReleases = [{
  id: '2026-09-16-roles', date: '2026-09-16', title: 'Role commands are ready to test',
  summary: 'You can now manage roles from Discord or the Beta dashboard.',
  changes: [
    'Add or remove a member\'s role, create a role, change its name and color, or check its details.',
    'Bulk add and remove show a preview first. Pick humans, bots, or everyone, and optionally filter by an existing role.',
    'Bulk changes support up to 100 eligible members per preview. Confirm within two minutes; nothing changes before you confirm.',
    'Role deletion also needs confirmation. Roles above DexzuBot and managed roles stay protected.',
    'Autorole now has slash commands and a dashboard control. Failed saves no longer report success.',
  ],
  tryIt: ['Discord: /role or /autorole', 'Dashboard: switch to Beta, then open Operations → Role management.'],
  scope: 'Beta server only for now. Existing main-server prefix autorole still works.',
}];
