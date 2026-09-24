import { ChannelType } from 'discord.js';
import { isBetaGuild } from '../config/beta.js';
import { getFaithState, saveFaithSettings } from '../services/faithService.js';

export function registerFaithRoutes(router, client) {
  const handled = action => async (req, res, next) => {
    if (!isBetaGuild(req.dashboardGuild.id)) return res.status(403).json({ error: 'Faith tools are available in Beta first.' });
    try { await action(req, res); }
    catch (error) {
      if (error.name === 'ZodError') return res.status(400).json({ error: 'Choose valid Faith settings: channel, HH:MM time, IANA timezone and WEB translation.' });
      if (['validation', 'permission', 'configuration'].includes(error.type)) return res.status(400).json({ error: error.userMessage || error.message });
      next(error);
    }
  };
  router.get('/faith', handled(async (req, res) => {
    const guild = req.dashboardGuild;
    await guild.channels.fetch();
    res.json({ ...await getFaithState(client, guild), channels: [...guild.channels.cache.values()]
      .filter(channel => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type))
      .map(channel => ({ id: channel.id, name: channel.name })) });
  }));
  // Mounted after the existing workspace authorization and same-origin middleware.
  router.post('/faith', handled(async (req, res) => {
    res.json({ ok: true, config: await saveFaithSettings(client, req.dashboardGuild, req.body) });
  }));
}
