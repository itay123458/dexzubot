import axios from 'axios';
import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

const CHANNEL_HANDLE = '@DexzuGtag';
const CHANNEL_ID = 'UC3Ll8n2z4N_SsQpN7iWpNsA';
const CHANNEL_URL = `https://www.youtube.com/${CHANNEL_HANDLE}`;
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const VIDEO_ID_PATTERN = /<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/;

async function getLatestVideoUrl() {
    const response = await axios.get(FEED_URL, {
        responseType: 'text',
        timeout: 10_000,
        headers: {
            'User-Agent': 'DexzuBot/1.0',
        },
    });

    const match = String(response.data).match(VIDEO_ID_PATTERN);
    if (!match) {
        throw new Error('YouTube feed did not contain a video ID');
    }

    return `https://www.youtube.com/watch?v=${match[1]}`;
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('latestvideo')
        .setDescription(`Post the newest video from ${CHANNEL_HANDLE}`),

    async execute(interaction) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            const videoUrl = await getLatestVideoUrl();
            await InteractionHelper.safeEditReply(interaction, {
                content: `🎬 **Newest video from [${CHANNEL_HANDLE}](${CHANNEL_URL})**\n${videoUrl}`,
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            logger.error('Latest video command failed:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Video Unavailable',
                    description: `I could not load the newest video from [${CHANNEL_HANDLE}](${CHANNEL_URL}). Please try again shortly.`,
                    color: 'error',
                })],
            });
        }
    },
};
