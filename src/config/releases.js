export const mainToolsRelease = {
  id: '2026-09-25-main-tools', date: '2026-09-25', title: 'Food, Bible and role tools in Main',
  summary: 'The tested food, Bible, role and autorole commands are available in Main under their normal permissions.',
  changes: ['Use /eat for the 120-food collection and /bible today for the 365-verse collection.', 'Role permissions, hierarchy checks and confirmations still apply. Existing server settings, channels, roles and artwork are preserved.'],
  tryIt: ['/eat, /bible today, /bible guide, /role list and /autorole.', 'Dashboard: Faith and Operations contain the corresponding controls. Daily Bible posts require explicit setup.'],
  scope: 'Main and Beta retain separate data. Unreleased experiments remain owner-only in Main.',
};
export const betaOwnerRelease = {
  id: '2026-09-25-beta-owner-main', date: '2026-09-25', title: 'Owner access to Beta commands in Main',
  summary: 'Configured bot owners can now use Beta commands in Main. Beta-server access stays the same.',
  changes: ['Main blocks everyone else, including administrators, from Beta-only commands and their protected interactions.', 'Existing role permissions and command switches still apply. Main and Beta keep separate records.'],
  tryIt: ['Bot owner in Main: /beta, /eat, /bible today or /role list.', 'Use /help to view the commands available to your account. Beta dashboard controls remain in the Beta workspace.'],
  scope: 'The exception uses configured bot-owner IDs. Discord may show commands to other members, but execution is denied.',
};
export const musicPrefixRelease = {
  id: '2026-09-25-music-prefix', date: '2026-09-25', title: 'Music commands with your prefix',
  summary: 'Music commands work with the server prefix as well as slash commands. Fixed a parser conflict that made !stop and !music stop return Wrong Usage.',
  changes: ['Use play, queue, join, nowplaying and every music subcommand with your configured prefix.', 'Song names and artists can contain spaces. Playback and search behavior stay the same.'],
  tryIt: ['With the current ! prefix: !play nevada vicetone, !queue, !np, !music loop track, !music shuffle.', 'Existing shortcuts include !pause, !resume, !skip, !stop, !volume 50 and !leave.', 'Dashboard: Operations > Prefix Commands controls the prefix and allowed channels/roles.'],
  scope: 'Main and Beta. Existing prefix staff/access rules still apply; this does not change audio-server availability.',
};
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
export const faithRelease = {
  id: '2026-09-24-faith', date: '2026-09-24', title: 'Faith and daily Bible verses',
  summary: 'Faith channels and a daily Bible verse are ready in Beta.',
  changes: ['Read and react in daily-bible, then discuss the verse in Bible-Talk.', 'Choose the posting channel, time and timezone in the Faith dashboard. Posts have no automatic pings.', 'Delivery history survives restarts; uncertain sends are checked before retrying.'],
  tryIt: ['Try /bible today or /bible guide.', 'Administrators: Beta → Faith, or /bible setup and /bible disable.'],
  scope: 'Beta only. English World English Bible, with 365 verified verses rotating daily.',
};
export const foodRelease = {
  id: '2026-09-24-food', date: '2026-09-24', title: 'Eat and collect foods',
  summary: 'Try /eat for a mystery meal, a reaction, and a new food to collect.',
  changes: ['Discover 120 foods, from everyday snacks to legendary dungeon meals.', 'New foods get a discovery badge; duplicates increase your eaten count. Existing discoveries stay saved as the collection grows.', 'Default cooldown is 30 seconds. No coins are spent.'],
  tryIt: ['Use /eat, then press My collection or use /eat action:collection.', 'Administrators: Beta → Operations → Food collection controls meals and cooldown.'],
  scope: 'Beta first. Common 70% · Rare 22% · Epic 7% · Legendary 1%.',
};
export const betaReleases = [foodRelease, faithRelease, {
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
