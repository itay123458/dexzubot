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
  resetCategoryCommands,
} from '../services/commandAccessService.js';
import { getGuildConfig, patchGuildConfig } from '../services/config/guildConfig.js';
import { fetchLatestYouTubeVideo } from '../services/youtubeAlertService.js';
import { syncGuildCommandRegistration } from '../handlers/loaders/commandLoader.js';
import { logger } from '../utils/logger.js';
import { EVENT_TYPES } from '../services/loggingService.js';
import { PERMANENT_LEVEL_UP_MESSAGE, resetGuildLevelData } from '../services/leveling/leveling.js';
import { getWelcomeConfig, saveWelcomeConfig } from '../utils/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, 'public');
const DASHBOARD_LOGGING_EVENTS = [
  ['moderation.ban', 'Bans'],
  ['moderation.softban', 'Softbans'],
  ['moderation.kick', 'Kicks'],
  ['moderation.timeout', 'Timeouts'],
  ['moderation.untimeout', 'Timeout removals'],
  ['moderation.unban', 'Unbans'],
  ['moderation.warn', 'Warnings'],
  ['moderation.purge', 'Message purges'],
  ['moderation.lock', 'Channel locks'],
  ['moderation.unlock', 'Channel unlocks'],
  ['moderation.dm', 'Moderator DMs'],
  ['message.delete', 'Deleted messages'],
  ['message.edit', 'Edited messages'],
  ['message.bulkdelete', 'Bulk message deletes'],
  ['voice.join', 'Voice joins'],
  ['voice.leave', 'Voice leaves'],
  ['voice.move', 'Voice moves'],
  ['member.join', 'Member joins'],
  ['member.leave', 'Member leaves'],
  ['member.namechange', 'Nickname changes'],
  ['member.roleupdate', 'Member role changes'],
  ['member.timeoutupdate', 'Manual timeout changes'],
  ['member.profileupdate', 'Avatar/profile changes'],
  ['role.create', 'Role creation'],
  ['role.delete', 'Role deletion'],
  ['role.update', 'Role updates'],
  ['channel.create', 'Channel creation'],
  ['channel.update', 'Channel updates'],
  ['channel.delete', 'Channel deletion'],
  ['guild.update', 'Server setting changes'],
  ['emoji.create', 'Emoji creation'],
  ['emoji.update', 'Emoji updates'],
  ['emoji.delete', 'Emoji deletion'],
  ['sticker.create', 'Sticker creation'],
  ['sticker.update', 'Sticker updates'],
  ['sticker.delete', 'Sticker deletion'],
  ['invite.create', 'Invite creation'],
  ['invite.delete', 'Invite deletion'],
];

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

function publicConfigState(client, guild, config, welcomeConfig) {
  const snapshot = getCommandAccessSnapshot(client, config);
  const channels = guild.channels.cache
    .filter(channel => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
    .map(channel => ({ id: channel.id, name: channel.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const owners = getBotOwners().map(id => {
    const user = client.users.cache.get(id);
    return { id, name: user?.username || id, avatar: user?.displayAvatarURL?.() || null };
  });
  const loggingEvents = DASHBOARD_LOGGING_EVENTS.map(([key, label]) => ({
    key,
    label,
    enabled: config.logging?.enabledEvents?.[key] !== false,
  }));

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
    logging: {
      enabled: config.logging?.enabled === true,
      channelId: config.logging?.channels?.audit || config.logging?.channelId || config.logChannelId || null,
      events: loggingEvents,
    },
    leveling: {
      enabled: config.leveling?.enabled === true,
      announceLevelUp: config.leveling?.announceLevelUp !== false,
      channelId: config.leveling?.levelUpChannel || null,
      xpMin: config.leveling?.xpRange?.min || config.leveling?.xpPerMessage?.min || 15,
      xpMax: config.leveling?.xpRange?.max || config.leveling?.xpPerMessage?.max || 25,
      cooldown: config.leveling?.xpCooldown ?? 20,
      multiplier: config.leveling?.xpMultiplier ?? 1,
    },
    greetings: {
      cardEnabled: welcomeConfig.cardEnabled === true,
      welcomeEnabled: welcomeConfig.enabled === true,
      welcomeChannelId: welcomeConfig.channelId || null,
      welcomeMessage: welcomeConfig.welcomeMessage || 'Welcome {user} to {server}!',
      goodbyeEnabled: welcomeConfig.goodbyeEnabled === true,
      goodbyeChannelId: welcomeConfig.goodbyeChannelId || null,
      goodbyeMessage: welcomeConfig.leaveMessage || '{user.tag} has left the server.',
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
    const [config, welcomeConfig] = await Promise.all([
      getGuildConfig(client, guild.id),
      getWelcomeConfig(client, guild.id),
    ]);
    return res.json(publicConfigState(client, guild, config, welcomeConfig));
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

  router.post('/logging', async (req, res) => {
    const guild = getDashboardGuild(client);
    const { enabled, channelId, enabledEventTypes } = req.body || {};
    const channel = guild?.channels.cache.get(channelId);
    const validEventTypes = new Set(Object.values(EVENT_TYPES));
    if (
      !guild ||
      typeof enabled !== 'boolean' ||
      !Array.isArray(enabledEventTypes) ||
      (enabled && (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement))) ||
      enabledEventTypes.some(type => !validEventTypes.has(type))
    ) {
      return res.status(400).json({ error: 'Choose a valid logging channel and event types.' });
    }

    const selected = new Set(enabledEventTypes);
    const config = await getGuildConfig(client, guild.id);
    const enabledEvents = { ...(config.logging?.enabledEvents || {}) };
    for (const [type] of DASHBOARD_LOGGING_EVENTS) {
      enabledEvents[type] = selected.has(type);
    }
    await patchGuildConfig(client, guild.id, {
      logging: {
        ...(config.logging || {}),
        enabled,
        channels: { ...(config.logging?.channels || {}), audit: channelId || null },
        enabledEvents,
      },
    });
    return res.json({ ok: true });
  });

  router.post('/leveling', async (req, res) => {
    const guild = getDashboardGuild(client);
    const { enabled, announceLevelUp, channelId, xpMin, xpMax, cooldown, multiplier } = req.body || {};
    const channel = guild?.channels.cache.get(channelId);
    const min = Number(xpMin);
    const max = Number(xpMax);
    const cooldownSeconds = Number(cooldown);
    const xpMultiplier = Number(multiplier);
    if (!guild || typeof enabled !== 'boolean' || typeof announceLevelUp !== 'boolean' ||
      !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 1000 || min > max ||
      !Number.isInteger(cooldownSeconds) || cooldownSeconds < 0 || cooldownSeconds > 3600 ||
      !Number.isFinite(xpMultiplier) || xpMultiplier < 0.1 || xpMultiplier > 10 ||
      (enabled && announceLevelUp && (!channel || !channel.isTextBased?.()))) {
      return res.status(400).json({ error: 'Choose valid leveling settings and an announcement channel.' });
    }
    const config = await getGuildConfig(client, guild.id);
    const access = getCommandAccessSnapshot(client, config);
    const levelingAccess = access.categories.find(category => category.key === 'leveling');
    const accessNeedsSync = enabled
      ? Boolean(levelingAccess?.categoryDisabled || levelingAccess?.disabledCount)
      : !levelingAccess?.categoryDisabled;
    await patchGuildConfig(client, guild.id, { leveling: {
      ...(config.leveling || {}), enabled, announceLevelUp, levelUpChannel: channelId || null,
      levelUpMessage: PERMANENT_LEVEL_UP_MESSAGE,
      xpRange: { min, max }, xpPerMessage: { min, max }, xpCooldown: cooldownSeconds, xpMultiplier,
    } });
    if (accessNeedsSync) {
      if (enabled) {
        await enableCategory(client, guild.id, 'Leveling', { actorId: req.dashboardUserId });
        await resetCategoryCommands(client, guild.id, 'Leveling', { actorId: req.dashboardUserId });
      } else {
        await disableCategory(client, guild.id, 'Leveling', { actorId: req.dashboardUserId });
      }
      await syncGuildCommandRegistration(client, guild.id);
    }
    return res.json({ ok: true });
  });

  router.post('/leveling/reset', async (req, res) => {
    const guild = getDashboardGuild(client);
    if (!guild || req.body?.confirm !== guild.name) {
      return res.status(400).json({ error: 'Type the exact server name to confirm the XP reset.' });
    }
    const resetCount = await resetGuildLevelData(client, guild.id);
    return res.json({ ok: true, resetCount });
  });

  router.post('/greetings', async (req, res) => {
    const guild = getDashboardGuild(client);
    const { cardEnabled, welcomeEnabled, welcomeChannelId, welcomeMessage, goodbyeEnabled, goodbyeChannelId, goodbyeMessage } = req.body || {};
    const welcomeChannel = guild?.channels.cache.get(welcomeChannelId);
    const goodbyeChannel = guild?.channels.cache.get(goodbyeChannelId);
    if (!guild || typeof cardEnabled !== 'boolean' || typeof welcomeEnabled !== 'boolean' || typeof goodbyeEnabled !== 'boolean' ||
      typeof welcomeMessage !== 'string' || !welcomeMessage.trim() || welcomeMessage.length > 1000 ||
      typeof goodbyeMessage !== 'string' || !goodbyeMessage.trim() || goodbyeMessage.length > 1000 ||
      (welcomeEnabled && !welcomeChannel?.isTextBased?.()) || (goodbyeEnabled && !goodbyeChannel?.isTextBased?.())) {
      return res.status(400).json({ error: 'Choose valid welcome/goodbye channels and messages.' });
    }
    const current = await getWelcomeConfig(client, guild.id);
    const saved = await saveWelcomeConfig(client, guild.id, {
      ...current, cardEnabled, enabled: welcomeEnabled, channelId: welcomeChannelId || null,
      welcomeMessage: welcomeMessage.trim(), goodbyeEnabled, goodbyeChannelId: goodbyeChannelId || null,
      leaveMessage: goodbyeMessage.trim(),
    });
    if (!saved) return res.status(500).json({ error: 'Failed to save welcome settings.' });
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
