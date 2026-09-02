import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import { getGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

export const YOUTUBE_CHANNEL_HANDLE = '@DexzuGtag';
export const YOUTUBE_CHANNEL_ID = 'UC3Ll8n2z4N_SsQpN7iWpNsA';
export const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/${YOUTUBE_CHANNEL_HANDLE}`;

const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
const POLL_INTERVAL_MS = 2 * 60 * 1000;
const activePollers = new WeakMap();
const activeGuildChecks = new WeakMap();
const MAX_POSTED_VIDEO_HISTORY = 50;
const MAX_DELIVERY_HISTORY = 25;
const historyKey = guildId => `temp:youtube-alert-history:${guildId}`;

function decodeXml(value = '') {
    return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function readEntryValue(entry, tag) {
    const match = entry.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
    return match ? decodeXml(match[1].trim()) : '';
}

function parseFeed(feed) {
    return [...String(feed).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
        const id = entry.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/)?.[1];
        if (!id) return null;
        return {
            id,
            url: `https://www.youtube.com/watch?v=${id}`,
            title: readEntryValue(entry, 'title') || 'New Dexzu video',
            publishedAt: readEntryValue(entry, 'published'),
            thumbnailUrl: entry.match(/<media:thumbnail\s+url="([^"]+)"/)?.[1] || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
        };
    }).filter(Boolean);
}

async function fetchYouTubeVideos() {
    const response = await axios.get(FEED_URL, { responseType: 'text', timeout: 10_000, headers: { 'User-Agent': 'DexzuBot/1.0' } });
    const videos = parseFeed(response.data);
    if (!videos.length) throw new Error('YouTube feed did not contain any videos');
    return videos;
}

async function getAlertState(client, guildId) {
    const value = await client.db?.get?.(historyKey(guildId), {});
    return {
        videoIds: Array.isArray(value?.videoIds) ? value.videoIds : [],
        deliveries: Array.isArray(value?.deliveries) ? value.deliveries : [],
        updatedAt: value?.updatedAt || null,
        lastCheckedAt: value?.lastCheckedAt || null,
        lastSuccessfulCheckAt: value?.lastSuccessfulCheckAt || null,
        lastError: value?.lastError || null,
    };
}

async function saveAlertState(client, guildId, state) {
    await client.db?.set?.(historyKey(guildId), state);
}

function upsertDelivery(state, video, update) {
    const previous = state.deliveries.find(item => item.videoId === video.id) || {};
    const delivery = { ...previous, videoId: video.id, title: video.title, url: video.url, thumbnailUrl: video.thumbnailUrl, publishedAt: video.publishedAt, ...update };
    state.deliveries = [delivery, ...state.deliveries.filter(item => item.videoId !== video.id)]
        .sort((a, b) => new Date(b.sentAt || b.detectedAt || 0) - new Date(a.sentAt || a.detectedAt || 0)).slice(0, MAX_DELIVERY_HISTORY);
    return delivery;
}

async function findExistingAlert(channel, video) {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    return messages?.find(message => message.author.id === channel.client.user.id &&
        (message.content.includes(video.url) || message.embeds.some(embed => embed.url === video.url))) || null;
}

export async function fetchLatestYouTubeVideo() {
    return (await fetchYouTubeVideos())[0];
}

export async function getYouTubeAlertStatus(client, guildId) {
    const state = await getAlertState(client, guildId);
    return { deliveries: state.deliveries.slice(0, 10), lastCheckedAt: state.lastCheckedAt, lastSuccessfulCheckAt: state.lastSuccessfulCheckAt, lastError: state.lastError };
}

export async function runYouTubeAlertCheck(client, guild) {
    const videos = await fetchYouTubeVideos();
    await checkGuild(client, guild, videos);
    return getYouTubeAlertStatus(client, guild.id);
}

export async function retryFailedYouTubeAlerts(client, guild) {
    const state = await getAlertState(client, guild.id);
    let queued = 0;
    state.deliveries = state.deliveries.map(delivery => {
        if (delivery.status !== 'failed') return delivery;
        queued += 1;
        return { ...delivery, nextRetryAt: null };
    });
    await saveAlertState(client, guild.id, state);
    if (queued) await runYouTubeAlertCheck(client, guild);
    return { queued, ...(await getYouTubeAlertStatus(client, guild.id)) };
}

export async function sendYouTubeAlert(channel, video, { test = false } = {}) {
    const embed = new EmbedBuilder().setColor(0xff0000).setAuthor({ name: 'Dexzu', iconURL: channel.client.user.displayAvatarURL(), url: YOUTUBE_CHANNEL_URL })
        .setTitle(video.title || 'New Dexzu video').setURL(video.url).setDescription('Dexzu published a new video on YouTube!')
        .setImage(video.thumbnailUrl || `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`).setFooter({ text: test ? 'YouTube • Test alert' : 'YouTube' });
    const publishedAt = Date.parse(video.publishedAt);
    if (Number.isFinite(publishedAt)) embed.setTimestamp(publishedAt);
    return channel.send({ content: `@everyone Dexzu just uploaded **${video.title || 'a new video'}** at ${video.url}!`, embeds: [embed], allowedMentions: { parse: ['everyone'] } });
}

async function deliverVideo(client, guild, channel, alert, state, video) {
    const previous = state.deliveries.find(item => item.videoId === video.id);
    if (previous?.status === 'failed' && Date.parse(previous.nextRetryAt) > Date.now()) return false;
    const detectedAt = previous?.detectedAt || new Date().toISOString();
    const attempts = Number(previous?.attempts || 0) + 1;
    upsertDelivery(state, video, { status: 'sending', detectedAt, attempts, error: null, nextRetryAt: null });
    await saveAlertState(client, guild.id, state);
    try {
        const existing = await findExistingAlert(channel, video);
        const message = existing || await sendYouTubeAlert(channel, video);
        const sentAt = existing?.createdAt?.toISOString?.() || new Date().toISOString();
        upsertDelivery(state, video, { status: 'sent', detectedAt, sentAt, attempts, messageId: message.id, error: null, nextRetryAt: null });
        state.videoIds = [video.id, ...state.videoIds.filter(id => id !== video.id)].slice(0, MAX_POSTED_VIDEO_HISTORY);
        state.updatedAt = sentAt;
        await saveAlertState(client, guild.id, state);
        await patchGuildConfig(client, guild.id, { youtubeAlert: { ...alert, lastVideoId: video.id, lastPostedAt: sentAt } });
        logger.info('[YOUTUBE_ALERT] Posted new video', { guildId: guild.id, channelId: channel.id, videoId: video.id, reconciled: Boolean(existing) });
        return true;
    } catch (error) {
        const retryMinutes = Math.min(30, 2 ** Math.min(attempts - 1, 5));
        upsertDelivery(state, video, { status: 'failed', detectedAt, failedAt: new Date().toISOString(), attempts, error: error.message.slice(0, 180), nextRetryAt: new Date(Date.now() + retryMinutes * 60_000).toISOString() });
        state.lastError = `Delivery failed for ${video.id}: ${error.message}`.slice(0, 220);
        await saveAlertState(client, guild.id, state);
        logger.error('[YOUTUBE_ALERT] Delivery failed; retry scheduled', { guildId: guild.id, videoId: video.id, attempts, retryMinutes, error: error.message });
        return false;
    }
}

export async function checkGuild(client, guild, videos) {
    let checks = activeGuildChecks.get(client);
    if (!checks) { checks = new Set(); activeGuildChecks.set(client, checks); }
    if (checks.has(guild.id)) return;
    checks.add(guild.id);
    try {
        const config = await getGuildConfig(client, guild.id);
        const alert = config.youtubeAlert;
        if (!alert?.enabled || !alert.channelId) return;
        const state = await getAlertState(client, guild.id);
        state.lastCheckedAt = new Date().toISOString();
        if (!state.deliveries.length && alert.lastVideoId && alert.lastPostedAt) {
            const previousVideo = videos.find(video => video.id === alert.lastVideoId);
            if (previousVideo) upsertDelivery(state, previousVideo, { status: 'sent', detectedAt: alert.lastPostedAt, sentAt: alert.lastPostedAt, attempts: 1, migrated: true });
        }
        const channel = await guild.channels.fetch(alert.channelId).catch(() => null);
        if (!channel?.isTextBased?.()) {
            state.lastError = 'The configured alert channel is unavailable.';
            await saveAlertState(client, guild.id, state);
            return;
        }
        if (!state.videoIds.length) {
            state.videoIds = videos.map(video => video.id).slice(0, MAX_POSTED_VIDEO_HISTORY);
            state.updatedAt = new Date().toISOString();
            state.lastSuccessfulCheckAt = state.updatedAt;
            state.lastError = null;
            await saveAlertState(client, guild.id, state);
            await patchGuildConfig(client, guild.id, { youtubeAlert: { ...alert, lastVideoId: videos[0].id } });
            return;
        }
        const retryVideos = state.deliveries.filter(item => item.status !== 'sent').map(item => ({ id: item.videoId, title: item.title, url: item.url, thumbnailUrl: item.thumbnailUrl, publishedAt: item.publishedAt }));
        const knownIndex = videos.findIndex(video => state.videoIds.includes(video.id));
        const newVideos = knownIndex >= 0 ? videos.slice(0, knownIndex) : videos.filter(video => Date.parse(video.publishedAt) > Date.parse(state.updatedAt || 0));
        const candidates = [...retryVideos, ...newVideos].filter((video, index, all) => all.findIndex(item => item.id === video.id) === index).reverse();
        let allDelivered = true;
        for (const video of candidates) if (!state.videoIds.includes(video.id) && !(await deliverVideo(client, guild, channel, alert, state, video))) allDelivered = false;
        state.lastSuccessfulCheckAt = new Date().toISOString();
        if (allDelivered) state.lastError = null;
        await saveAlertState(client, guild.id, state);
    } finally { checks.delete(guild.id); }
}

export async function pollYouTubeAlerts(client) {
    try {
        const videos = await fetchYouTubeVideos();
        for (const guild of client.guilds.cache.values()) await checkGuild(client, guild, videos).catch(error => logger.error('[YOUTUBE_ALERT] Guild check failed:', error));
    } catch (error) {
        logger.error('[YOUTUBE_ALERT] Feed poll failed:', error);
        for (const guild of client.guilds.cache.values()) {
            const state = await getAlertState(client, guild.id).catch(() => null);
            if (!state) continue;
            state.lastCheckedAt = new Date().toISOString();
            state.lastError = `Feed check failed: ${error.message}`.slice(0, 220);
            await saveAlertState(client, guild.id, state).catch(() => {});
        }
    }
}

export function initializeYouTubeAlerts(client) {
    if (activePollers.has(client)) return;
    const timer = setInterval(() => void pollYouTubeAlerts(client), POLL_INTERVAL_MS);
    timer.unref?.(); activePollers.set(client, timer); void pollYouTubeAlerts(client);
    logger.info('[YOUTUBE_ALERT] Poller started', { intervalMs: POLL_INTERVAL_MS });
}
