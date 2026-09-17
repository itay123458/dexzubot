import { z } from 'zod';
import { ChannelType } from 'discord.js';
import { isBetaGuild } from '../config/beta.js';
import { getCommunityConfig, saveCommunityConfig, assertCommunityReviewer } from '../services/communityBetaService.js';
import { publishCommunityPanel, refreshCommunityTicketPanel } from '../services/communityBetaPanels.js';
import { getStaffState, performStaffAction } from '../services/betaStaffService.js';
import { resetInviteRewardBaseline, initializeInviteRewards } from '../services/betaInviteRewardsService.js';

const kinds = ['inviteRewards', 'ticketCategories', 'applications', 'leave', 'activity', 'serverInfo'];
const reviewInput = z.object({ id: z.string().min(1).max(100), status: z.enum(['approved', 'denied']), reason: z.string().trim().max(1000) }).strict();
const staffSchema = z.discriminatedUnion('action', [
  ...['review'].map(action => z.object({ action: z.literal(action), input: reviewInput }).strict()),
  z.object({ action: z.literal('activity-start'), input: z.object({ hours: z.number().int().min(1).max(336) }).strict() }).strict(),
  z.object({ action: z.literal('activity-end'), input: z.object({ id: z.string().min(1).max(100) }).strict() }).strict(),
]);
const betaOnly = (req, res, next) => isBetaGuild(req.dashboardGuild?.id) ? next() : res.status(403).json({ error: 'Community tools are available in the Beta workspace.' });
const handled = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (['validation', 'permission', 'user_input', 'configuration'].includes(error.type)) return res.status(400).json({ error: error.userMessage || error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Choose valid community settings.' });
    next(error);
  }
};
async function reviewer(client, guild) {
  const actor = await guild.members.fetchMe({ force: true });
  assertCommunityReviewer(guild, actor, await getCommunityConfig(client, guild.id));
  return actor;
}
export function registerCommunityBetaRoutes(router, client) {
  router.get('/community-beta', betaOnly, handled(async (req, res) => {
    const guild = req.dashboardGuild;
    await reviewer(client, guild);
    await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
    const [config, staff] = await Promise.all([getCommunityConfig(client, guild.id), getStaffState(client, guild)]);
    res.json({ config, staff,
      roles: [...guild.roles.cache.values()].filter(role => role.id !== guild.id && !role.managed).map(role => ({ id: role.id, name: role.name })),
      channels: [...guild.channels.cache.values()].filter(channel => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)).map(channel => ({ id: channel.id, name: channel.name })),
    });
  }));
  router.post('/community-beta/settings', betaOnly, handled(async (req, res) => {
    await reviewer(client, req.dashboardGuild);
    const patch = z.record(z.unknown()).parse(req.body);
    const config = await saveCommunityConfig(client, req.dashboardGuild, patch);
    if (patch.features?.inviteRewards !== undefined || patch.minAccountDays !== undefined || patch.minimumStayHours !== undefined) {
      resetInviteRewardBaseline(client,req.dashboardGuild.id);
      await initializeInviteRewards(client,req.dashboardGuild.id);
    }
    let warning;
    if (patch.ticketButtons || patch.features?.ticketCategories !== undefined) {
      try {
        const refresh = await refreshCommunityTicketPanel(client, req.dashboardGuild);
        if (refresh.errors?.length || (typeof refresh.errors === 'number' && refresh.errors > 0)) warning = 'Settings saved, but some existing ticket panels could not be updated. Publish the ticket panel again to retry.';
      } catch {
        warning = 'Settings saved, but existing ticket panels could not be updated. Publish the ticket panel again to retry.';
      }
    }
    res.json({ ok: true, config, ...(warning ? { warning } : {}) });
  }));
  router.post('/community-beta/publish', betaOnly, handled(async (req, res) => {
    const { kind } = z.object({ kind: z.enum(kinds) }).strict().parse(req.body);
    await reviewer(client, req.dashboardGuild);
    const result = await publishCommunityPanel(client, req.dashboardGuild, kind);
    res.json({ ok: true, result });
  }));
  router.post('/community-beta/staff', betaOnly, handled(async (req, res) => {
    const { action, input } = staffSchema.parse(req.body);
    const guild = req.dashboardGuild, actor = await reviewer(client, guild);
    const result = await performStaffAction({ client, guild, actor, action, input });
    res.json({ ok: true, result });
  }));
}

