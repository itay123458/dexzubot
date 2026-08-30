import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import { getGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

export const YOUTUBE_CHANNEL_HANDLE = '@DexzuGtag';
export const YOUTUBE_CHANNEL_ID = 'UC3Ll8n2z4N_SsQpN7iWpNsA';
export const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/${YOUTUBE_CHANNEL_HANDLE}`;

const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
const POLL_INTERVAL_MS = 2 * 60 * 1000;
const VIDEO_ID_PATTERN = /<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/;
const activePollers = new WeakMap();
const activeGuildChecks = new WeakMap();
const MAX_POSTED_VIDEO_HISTORY = 50;

function getHistoryKey(guildId) {
    return `temp:youtube-alert-history:${guildId}`;
}

async function getPostedVideoIds(client, guildId) {
    const history = await client.db?.get?.(getHistoryKey(guildId), { videoIds: [] });
    return Array.isArray(history?.videoIds) ? history.videoIds : [];
}

async function rememberPostedVideo(client, guildId, videoId, existingIds = []) {
    const videoIds = [videoId, ...existingIds.filter(id => id !== videoId)]
        .slice(0, MAX_POSTED_VIDEO_HISTORY);
    const saved = await client.db?.set?.(getHistoryKey(guildId), {
        videoIds,
        updatedAt: new Date().toISOString(),
    });
    if (!saved) {
        logger.warn('[YOUTUBE_ALERT] Could not persist posted-video history', { guildId, videoId });
    }
}

function decodeXml(value = '') {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'");
}

function readEntryValue(entry, tag) {
    const match = entry.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
    return match ? decodeXml(match[1].trim()) : '';
}

export async function fetchLatestYouTubeVideo() {
    const response = await axios.get(FEED_URL, {
        responseType: 'text',
        timeout: 10_000,
        headers: { 'User-Agent': 'DexzuBot/1.0' },
    });

    const feed = String(response.data);
    const entry = feed.match(/<entry>([\s\S]*?)<\/entry>/)?.[1] || feed;
    const match = entry.match(VIDEO_ID_PATTERN);
    if (!match) {
        throw new Error('YouTube feed did not contain a video ID');
    }

    return {
        id: match[1],
        url: `https://www.youtube.com/watch?v=${match[1]}`,
        title: readEntryValue(entry, 'title') || 'New Dexzu video',
        publishedAt: readEntryValue(entry, 'published'),
        thumbnailUrl: entry.match(/<media:thumbnail\s+url="([^"]+)"/)?.[1]
            || `https://i.ytimg.com/vi/${match[1]}/maxresdefault.jpg`,
    };
}

export async function sendYouTubeAlert(channel, video, { test = false } = {}) {
    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({
            name: 'Dexzu',
            iconURL: channel.client.user.displayAvatarURL(),
            url: YOUTUBE_CHANNEL_URL,
        })
        .setTitle(video.title || 'New Dexzu video')
        .setURL(video.url)
        .setDescription('Dexzu published a new video on YouTube!')
        .setImage(video.thumbnailUrl || `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`)
        .setFooter({ text: test ? 'YouTube • Test alert' : 'YouTube' });

    const publishedAt = Date.parse(video.publishedAt);
    if (Number.isFinite(publishedAt)) embed.setTimestamp(publishedAt);

    return channel.send({
        content: `@everyone Dexzu just uploaded **${video.title || 'a new video'}** at ${video.url}!`,
        embeds: [embed],
        allowedMentions: { parse: ['everyone'] },
    });
}

export async function checkGuild(client, guild, latestVideo) {
    let checks = activeGuildChecks.get(client);
    if (!checks) {
        checks = new Set();
        activeGuildChecks.set(client, checks);
    }
    if (checks.has(guild.id)) return;
    checks.add(guild.id);

    try {
    const config = await getGuildConfig(client, guild.id);
    const alert = config.youtubeAlert;
    if (!alert?.enabled || !alert.channelId) return;

    const postedVideoIds = await getPostedVideoIds(client, guild.id);

    // Seed the durable history without posting when upgrading from the old
    // single-ID tracker. This prevents the current upload from being repeated
    // during the first restart after deployment.
    if (postedVideoIds.length === 0) {
        await rememberPostedVideo(client, guild.id, latestVideo.id, postedVideoIds);
        if (alert.lastVideoId !== latestVideo.id) {
            await patchGuildConfig(client, guild.id, {
                youtubeAlert: { ...alert, lastVideoId: latestVideo.id },
            });
        }
        return;
    }

    if (alert.lastVideoId === latestVideo.id || postedVideoIds.includes(latestVideo.id)) {
        if (!postedVideoIds.includes(latestVideo.id)) {
            await rememberPostedVideo(client, guild.id, latestVideo.id, postedVideoIds);
        }
        return;
    }

    const channel = await guild.channels.fetch(alert.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
        logger.warn('[YOUTUBE_ALERT] Configured channel is unavailable', {
            guildId: guild.id,
            channelId: alert.channelId,
        });
        return;
    }

    await sendYouTubeAlert(channel, latestVideo);
    await rememberPostedVideo(client, guild.id, latestVideo.id, postedVideoIds);
    await patchGuildConfig(client, guild.id, {
        youtubeAlert: {
            ...alert,
            lastVideoId: latestVideo.id,
            lastPostedAt: new Date().toISOString(),
        },
    });

    logger.info('[YOUTUBE_ALERT] Posted new video', {
        guildId: guild.id,
        channelId: channel.id,
        videoId: latestVideo.id,
    });
    } finally {
        checks.delete(guild.id);
    }
}

export async function pollYouTubeAlerts(client) {
    try {
        const latestVideo = await fetchLatestYouTubeVideo();
        for (const guild of client.guilds.cache.values()) {
            await checkGuild(client, guild, latestVideo).catch(error => {
                logger.error('[YOUTUBE_ALERT] Guild check failed:', error);
            });
        }
    } catch (error) {
        logger.error('[YOUTUBE_ALERT] Feed poll failed:', error);
    }
}

export function initializeYouTubeAlerts(client) {
    if (activePollers.has(client)) return;

    const timer = setInterval(() => {
        void pollYouTubeAlerts(client);
    }, POLL_INTERVAL_MS);
    timer.unref?.();
    activePollers.set(client, timer);

    void pollYouTubeAlerts(client);
    logger.info('[YOUTUBE_ALERT] Poller started', { intervalMs: POLL_INTERVAL_MS });
}
