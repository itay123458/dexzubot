export const betaReleases = [{
  id: '2026-09-17-message-motion', date: '2026-09-17', title: 'Animated message artwork',
  summary: 'Dexzu artwork now moves in beta command replies and panels.',
  changes: [
    'A small animated Dexzu thumbnail for replies, support, verification, and role panels.',
    'Giveaways keep the slim banner, with a little blue light and movement around the edges.',
    'Turn animation on or off in Beta → Operations → Animated messages. Saving updates configured panels too.',
  ],
  tryIt: ['Try /ping or /role list in the beta server.', 'Text and buttons stay still. Discord controls GIF playback; older command replies keep their original design.'],
  scope: 'Beta only for now. The main server keeps its current design.',
}, {
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
