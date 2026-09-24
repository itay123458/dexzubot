import { z } from 'zod';
import { PermissionFlagsBits } from 'discord.js';
import { isBetaGuild } from '../config/beta.js';
import { betaReleases, communityRelease, dashboardAccessRelease, musicSearchRelease } from '../config/releases.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { isCommandEnabledInConfig } from '../services/commandAccessService.js';
import { executeRoleOperation } from '../services/roleOperationService.js';
import { assertRoleEditable, assertRoleManager } from '../services/roleManagementService.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../utils/database.js';
import { recordRecentActivity } from '../services/loggingService.js';

const id = z.string().regex(/^\d{17,20}$/);
const color = z.string().regex(/^#?[0-9a-f]{6}$/i).optional();
const actionSchema = z.discriminatedUnion('action', [
  ...['add', 'remove'].map(action => z.object({ action: z.literal(action), role: id, member: id }).strict()),
  ...['bulk-add', 'bulk-remove'].map(action => z.object({ action: z.literal(action), role: id,
    audience: z.enum(['humans', 'bots', 'all']), source: id.optional() }).strict()),
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(100), color }).strict(),
  z.object({ action: z.literal('edit'), role: id, name: z.string().trim().min(1).max(100).optional(), color,
    hoist: z.boolean().optional(), mentionable: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('delete'), role: id }).strict(),
  ...['confirm', 'cancel'].map(action => z.object({ action: z.literal(action), code: z.string().regex(/^[a-f0-9]{12}$/) }).strict()),
]);
const betaOnly = (req, res, next) => isBetaGuild(req.dashboardGuild?.id) ? next() : res.status(403).json({ error: 'Role controls are available in the Beta workspace.' });
const handled = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) {
    if (['validation', 'permission', 'user_input'].includes(error.type)) return res.status(400).json({ error: error.userMessage });
    next(error);
  }
};

export function registerRoleRoutes(router, client) {
  router.get('/releases', (req, res) => res.json({ releases: isBetaGuild(req.dashboardGuild.id) ? [musicSearchRelease,dashboardAccessRelease,communityRelease,...betaReleases] : [musicSearchRelease,dashboardAccessRelease,communityRelease] }));
  router.get('/roles', betaOnly, handled(async (req, res) => {
    const guild = req.dashboardGuild;
    await guild.roles.fetch();
    const me = req.dashboardMember || await guild.members.fetchMe({ force: true });
    const [welcome, config] = await Promise.all([getWelcomeConfig(client, guild.id), getGuildConfig(client, guild.id)]);
    const roles = [...guild.roles.cache.values()].sort((a, b) => b.comparePositionTo(a)).map(role => {
      let manageable = true;
      try { assertRoleEditable(guild, me, role); } catch { manageable = false; }
      return { id: role.id, name: role.name, color: role.hexColor, position: role.position,
        managed: role.managed, manageable, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions.toArray() };
    });
    res.json({ roles, autorole: { roleId: welcome.roleIds?.[0] ?? null,
      blocked: Boolean(config.verification?.enabled || config.verification?.autoVerify?.enabled) } });
  }));
  router.post('/roles/action', betaOnly, handled(async (req, res) => {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose valid role settings. Names need 1–100 characters; colors use six-digit hex codes.' });
    const input = parsed.data, guild = req.dashboardGuild;
    const config = await getGuildConfig(client, guild.id);
    if (input.action !== 'cancel' && !isCommandEnabledInConfig(config, `role ${input.action}`, 'Moderation')) {
      return res.status(403).json({ error: 'This role command is disabled for the beta server.' });
    }
    await guild.roles.fetch();
    for (const field of ['role', 'source']) if (input[field] && !guild.roles.cache.has(input[field])) {
      return res.status(400).json({ error: 'The selected role no longer exists in this server.' });
    }
    // Public requests use the signed-in member for hierarchy and permission checks.
    // The trusted private listener retains its existing administrative behavior.
    const me = req.dashboardMember || await guild.members.fetchMe({ force: true });
    let result;
    await executeRoleOperation({ guild, client, actorId: me.id, auditSource: req.dashboardMember ? 'authenticated dashboard' : 'private Beta dashboard',
      options: { getSubcommand: () => input.action, get: key => input[key] ?? null,
        getString: key => input[key] ?? null, getBoolean: key => input[key] ?? null,
        getRole: key => guild.roles.cache.get(input[key]) ?? null,
        getUser: key => input[key] ? { id: input[key] } : null },
      reply: (title, description, metadata = {}) => { result = { title, description, ...metadata }; },
    });
    await recordRecentActivity(client, guild.id, 'dashboard.roles', { title: result.title, description: `Role ${input.action} from the private Beta dashboard` });
    res.json({ ok: true, ...result });
  }));
  router.post('/roles/autorole', betaOnly, handled(async (req, res) => {
    const parsed = z.object({ roleId: id.nullable() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Choose a role or turn autorole off.' });
    const guild = req.dashboardGuild, roleId = parsed.data.roleId;
    await guild.roles.fetch();
    const me = req.dashboardMember || await guild.members.fetchMe({ force: true });
    assertRoleManager(guild, me);
    if (!me.permissions.has(PermissionFlagsBits.ManageGuild)) return res.status(400).json({ error: 'DexzuBot needs Manage Server to change autorole.' });
    const config = await getGuildConfig(client, guild.id);
    if (roleId) {
      if (config.verification?.enabled || config.verification?.autoVerify?.enabled) return res.status(400).json({ error: 'Disable verification and AutoVerify before setting an autorole.' });
      assertRoleEditable(guild, me, guild.roles.cache.get(roleId));
    }
    await updateWelcomeConfig(client, guild.id, { roleIds: roleId ? [roleId] : [] });
    res.json({ ok: true, roleId });
  }));
}
