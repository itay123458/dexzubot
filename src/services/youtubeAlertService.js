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
        description: readEntryValue(entry, 'media:description'),
        publishedAt: readEntryValue(entry, 'published'),
        thumbnailUrl: entry.match(/<media:thumbnail\s+url="([^"]+)"/)?.[1]
            || `https://i.ytimg.com/vi/${match[1]}/maxresdefault.jpg`,
    };
}

export async function sendYouTubeAlert(channel, video, { test = false } = {}) {
    const description = video.description?.trim() || 'Dexzu published a video on YouTube!';
    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({
            name: 'Dexzu',
            iconURL: channel.client.user.displayAvatarURL(),
            url: YOUTUBE_CHANNEL_URL,
        })
        .setTitle(video.title || 'New Dexzu video')
        .setURL(video.url)
        .setDescription(`Dexzu published a video on YouTube!\n\n**Description**\n${description.slice(0, 3500)}`)
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

async function checkGuild(client, guild, latestVideo) {
    const config = await getGuildConfig(client, guild.id);
    const alert = config.youtubeAlert;
    if (!alert?.enabled || !alert.channelId) return;

    if (!alert.lastVideoId) {
        await patchGuildConfig(client, guild.id, {
            youtubeAlert: { ...alert, lastVideoId: latestVideo.id },
        });
        return;
    }

    if (alert.lastVideoId === latestVideo.id) return;

    const channel = await guild.channels.fetch(alert.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
        logger.warn('[YOUTUBE_ALERT] Configured channel is unavailable', {
            guildId: guild.id,
            channelId: alert.channelId,
        });
        return;
    }

    await sendYouTubeAlert(channel, latestVideo);
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
