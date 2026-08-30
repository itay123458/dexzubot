import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChannelType } from 'discord.js';
import { getBotOwners } from '../config/bot.js';
import { isSlashCommandCategoryEnabled } from '../config/commands/slashCommandCategories.js';
import {
  disableCategory,
  enableCategory,
  getCommandAccessSnapshot,
} from '../services/commandAccessService.js';
import { getGuildConfig, patchGuildConfig } from '../services/config/guildConfig.js';
import { fetchLatestYouTubeVideo } from '../services/youtubeAlertService.js';
import { syncGuildCommandRegistration } from '../handlers/loaders/commandLoader.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, 'public');

function getDashboardGuild(client) {
  const configuredGuild = process.env.GUILD_ID && client.guilds.cache.get(process.env.GUILD_ID);
  return configuredGuild || client.guilds.cache.first() || null;
}

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function publicConfigState(client, guild, config) {
  const snapshot = getCommandAccessSnapshot(client, config);
  const channels = guild.channels.cache
    .filter(channel => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
    .map(channel => ({ id: channel.id, name: channel.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const owners = getBotOwners().map(id => {
    const user = client.users.cache.get(id);
    return { id, name: user?.username || id, avatar: user?.displayAvatarURL?.() || null };
  });

  return {
    bot: {
      name: client.user.username,
      avatar: client.user.displayAvatarURL({ size: 256 }),
      online: client.isReady(),
      uptimeSeconds: Math.floor(client.uptime / 1000),
      loadedCommands: client.commands.size,
    },
    server: {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ size: 256 }),
      members: guild.memberCount,
      channels: guild.channels.cache.size,
    },
    database: client.db?.getStatus?.() || null,
    channels,
    owners,
    categories: snapshot.categories
      .filter(category => isSlashCommandCategoryEnabled(category.folder))
      .map(category => ({
        key: category.key,
        name: category.displayName,
        enabled: !category.categoryDisabled,
        enabledCommands: category.enabledCount,
        totalCommands: category.totalCount,
      })),
    antiPromo: {
      enabled: config.autoModeration?.antiPromo === true,
      allowedChannelIds: config.autoModeration?.promoAllowedChannelIds || [],
    },
    antiPing: {
      enabled: config.autoModeration?.antiPing === true,
      protectedUserIds: config.autoModeration?.antiPingUserIds || [],
    },
    youtube: {
      enabled: config.youtubeAlert?.enabled === true,
      channelId: config.youtubeAlert?.channelId || null,
      lastVideoId: config.youtubeAlert?.lastVideoId || null,
      lastPostedAt: config.youtubeAlert?.lastPostedAt || null,
    },
  };
}

export function registerDashboard(app, client) {
  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' https://cdn.discordapp.com https://*.discordapp.net data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.method !== 'GET' && !sameOrigin(req)) {
      return res.status(403).json({ error: 'Cross-origin dashboard request rejected.' });
    }
    next();
  });

  router.get('/state', async (req, res) => {
    const guild = getDashboardGuild(client);
    if (!guild) return res.status(503).json({ error: 'The bot is not connected to a server.' });
    const config = await getGuildConfig(client, guild.id);
    return res.json(publicConfigState(client, guild, config));
  });

  router.post('/category', async (req, res) => {
    const guild = getDashboardGuild(client);
    const { category, enabled } = req.body || {};
    if (!guild || typeof category !== 'string' || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Invalid category update.' });
    }
    if (enabled) await enableCategory(client, guild.id, category);
    else await disableCategory(client, guild.id, category);
    await syncGuildCommandRegistration(client, guild.id);
    return res.json({ ok: true });
  });

  router.post('/anti-promo', async (req, res) => {
    const guild = getDashboardGuild(client);
    const { enabled, allowedChannelIds } = req.body || {};
    if (!guild || typeof enabled !== 'boolean' || !Array.isArray(allowedChannelIds)) {
      return res.status(400).json({ error: 'Invalid anti-promo settings.' });
    }
    const validIds = [...new Set(allowedChannelIds)]
      .filter(id => guild.channels.cache.get(id)?.isTextBased?.())
      .slice(0, 25);
    await patchGuildConfig(client, guild.id, {
      autoModeration: { antiPromo: enabled, promoAllowedChannelIds: validIds },
    });
    return res.json({ ok: true });
  });

  router.post('/anti-ping', async (req, res) => {
    const guild = getDashboardGuild(client);
    const requestedIds = Array.isArray(req.body?.protectedUserIds) ? req.body.protectedUserIds : [];
    if (!guild) return res.status(503).json({ error: 'Server unavailable.' });
    const ownerIds = new Set(getBotOwners());
    const protectedUserIds = [...new Set(requestedIds)].filter(id => ownerIds.has(id));
    await patchGuildConfig(client, guild.id, {
      autoModeration: { antiPing: protectedUserIds.length > 0, antiPingUserIds: protectedUserIds },
    });
    return res.json({ ok: true });
  });

  router.post('/youtube', async (req, res) => {
    const guild = getDashboardGuild(client);
    const { enabled, channelId } = req.body || {};
    const channel = guild?.channels.cache.get(channelId);
    if (!guild || typeof enabled !== 'boolean' || (enabled && !channel?.isTextBased?.())) {
      return res.status(400).json({ error: 'Choose a valid YouTube alert channel.' });
    }
    const config = await getGuildConfig(client, guild.id);
    const current = config.youtubeAlert || {};
    let lastVideoId = current.lastVideoId;
    if (enabled && !lastVideoId) {
      lastVideoId = (await fetchLatestYouTubeVideo()).id;
    }
    await patchGuildConfig(client, guild.id, {
      youtubeAlert: { ...current, enabled, channelId: enabled ? channelId : current.channelId, lastVideoId },
    });
    return res.json({ ok: true });
  });

  router.use((error, req, res, next) => {
    logger.error('Dashboard API error', { error: error.message, path: req.path });
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: error.userMessage || 'Dashboard update failed.' });
  });

  app.use('/dashboard', (req, res, next) => {
    res.set('X-Frame-Options', 'DENY');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' https://cdn.discordapp.com https://*.discordapp.net data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use('/dashboard/api', router);
  app.use('/dashboard', express.static(publicPath, { index: 'index.html', fallthrough: false }));
}
