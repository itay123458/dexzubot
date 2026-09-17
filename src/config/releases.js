export const dashboardAccessRelease = {
 id:'2026-09-17-dashboard-access',date:'2026-09-17',title:'Dashboard invites',
 summary:'Invited members can open the dashboard without Tailscale and sign in with Discord.',
 changes:['Each invite belongs to one Discord account and one workspace, and expires after 1–168 hours.','Viewer access is read-only and includes private dashboard records. Managers also need Discord Administrator permission to make changes.','The bot owner can create invites and revoke access under Operations → Dashboard access.'],
 tryIt:['Open your invite link and sign in with the Discord account it was created for.','After accepting, use the normal dashboard link. Sign-in sessions last up to 12 hours.'],
 scope:'Main and Beta access is separate. A forwarded invite cannot be used by a different account.'
};
export const communityRelease = {
 id:'2026-09-17-community-release',date:'2026-09-17',title:'Community tools are live',
 summary:'The community tools are now available on the main server.',
 changes:['Report and partnership tickets now ask for the right details.','Staff and partnership-manager applications use one card that updates as you answer.','Embed titles now pair the blue crown with moving gifts, search icons, starbursts or sparkles. Turn them off with Animated messages in the dashboard.','Invite rewards, leave requests, staff activity checks and server links have dashboard controls.','Optional application, ticket and leave updates go only to the member involved.'],
 tryIt:['Use /staff, /community guide or /invite-rewards.','Open Operations → Community tools in the selected dashboard workspace.'],
 scope:'Each server keeps its own settings and records. Invite rewards count new tracked joins, not past invites.'
};
export const betaReleases = [{
  id: '2026-09-17-community', date: '2026-09-17', title: 'Community tools are ready to test',
  summary: 'Invite rewards, ticket categories, and staff tools are now available in Beta.',
  changes: [
    'Turn General Support, Report a Member, and Partnership buttons on or off separately.',
    'Invite rewards have configurable milestones, balance checks, and one-time claims for tracked members who stay.',
    'Staff applications now update one card as you answer or resume. Full answers stay saved in the dashboard; no repeated question or answer posts.',
    'Activity checks show who responded, who is missing, and who is on approved leave. Server information panels have configurable channel links.',
    'Optional DMs cover application, ticket, and leave updates. Closed DMs do not undo a saved request.',
  ],
  tryIt: ['Beta → Operations → Community tools has the switches, channels, questions, rewards, and reviews.', 'Try /invite-rewards, /beta-staff, or /community-beta guide.'],
  scope: 'Beta server only. Invite tracking starts now; old or ambiguous joins are not credited. Main rollout still needs your go-ahead.',
}, {
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
