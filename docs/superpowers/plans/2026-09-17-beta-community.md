# Beta community tools implementation plan

Use subagent-driven development for independent implementation tasks and review.

Goal: implement all seven screenshot references (LOA repeated) as compact Dexzu
features, configurable in the private beta dashboard, with optional transactional
DM updates for applications, tickets, and leave requests. No staff reminder DMs.
Main rollout requires a later user request. Existing controls/data stay intact.

Architecture: shared beta configuration/permission/notification service; separate
invite and staff domain services; existing ticket service for category buttons.
State is guild-keyed in PostgreSQL. Shared embed/interaction helpers and existing
economy storage remain authoritative. Do not credit un-attributed invites.

- [ ] Foundation: strict persisted settings, beta guard, member/reviewer checks,
  per-feature switches, optional DM switches, failed-write tests.
- [ ] Invite rewards: attribution baseline and join/leave tracking; exclude bots,
  self-invites, ambiguous joins, too-new accounts; minimum membership time; count
  retained members; once-per-milestone cumulative rewards with atomic economy
  credit and claim markers; compact balance/claim buttons and slash command.
- [ ] Staff workflows: persistent private applications with start/cancel/resume
  and one question per answer; reviewer approval/denial; 1–14-day LOA requests,
  approval/denial and expiry; activity checks with responses, close/recovery,
  audit and approved-LOA exclusions. Optional outcome DMs with honest failures.
- [ ] Ticket categories: toggle General support, Report a member, Partnership
  buttons using existing ticket permissions/creation/close lifecycle; category
  context persisted; optional open/close DMs.
- [ ] Server information: live-at-publish member/boost/creation stats and
  configurable valid Discord channel links; Dexzu branding and compact panel.
- [ ] Dashboard: beta Operations cards for each switch and role/channel settings,
  questions/milestones, publishing, staff reviews/activity actions, command guide.
  Preserve drafts, async error states, keyboard/mobile/reduced-motion behavior.
- [ ] Integration checks, bounded agent reviews, whole-change review, builds,
  beta-only deployment/health checks and Dexzu-themed release notes.

Shared interface: communityBetaService.js exports getCommunityConfig(client,id),
saveCommunityConfig(client,guild,patch), assertBetaFeature(client,id,feature),
assertCommunityReviewer(guild,member,config), assertCommunityStaff(guild,member,config),
notifyCommunityMember(client,guild,userId,kind,embed). Notification failures return
{sent:false,reason}; persistence never reports success after a failed write.

Configuration: features {inviteRewards,ticketCategories,applications,leave,activity,
serverInfo}; dmUpdates {applications,tickets,leave}; staffRoleId/reviewerRoleId/
reviewChannelId nullable; channels {inviteRewards,applications,leave,activity,
serverInfo}; links {rules,support,applications,giveaways,community,counting} channel
IDs; questions [{label,required}] (1–10); milestones [{invites,coins}] (1–10);
minAccountDays=7, minimumStayHours=24. Defaults off until configured. All IDs checked
against the selected guild on save. Other services must recheck switches on actions.

Task boundaries: root owns foundation, ticket integration, server-info, event and
route integration, release/deploy. Invite worker owns betaInviteRewardsService,
invite command/interactions and focused tests. Staff worker owns betaStaffService,
staff command/interactions and tests. Dashboard worker owns new community UI files
and dedicated routes, consuming shared config and domain APIs; root integrates
registration/index. No overlapping file writes or independent commits by workers.
