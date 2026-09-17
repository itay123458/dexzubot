import { getGuildConfig } from './config/guildConfig.js';
import { getAllReactionRoleMessages } from './reactionRoleService.js';
import { getGuildGiveaways } from '../utils/giveaways.js';
import { createGiveawayEmbed, createGiveawayButtons, withGiveawayArtwork } from './giveawayService.js';
import { createSupportPanelMessage } from '../utils/brandPanels.js';
import { buildVerificationPanelMessage, buildReactionRolePanelMessage, preserveReactionRolePanelText } from '../utils/communityPanels.js';
import { getReactionRoleKey } from '../utils/database/keys.js';
import { messageHasPanelMarker } from '../utils/panelStatus.js';
import { toContainerMessage } from '../utils/panelLayout.js';
import { Mutex } from '../utils/mutex.js';
import { logger } from '../utils/logger.js';
import { isCommunityGuild } from '../config/community.js';
import { embedMotionState, motionArtwork, runWithMessageGuild } from './embedMotionService.js';
import { cachedCommunityConfig } from './communityBetaService.js';
import { embedCrownRevision } from './embedCrownService.js';

export const PANEL_DESIGN_REVISION = 'crystal-components-v2-2026-09-16';
export const GIVEAWAY_DESIGN_REVISION = 'compact-giveaway-banner-2026-09-16';
export const panelDesignKey = (guildId, messageId) => `guild:${guildId}:panel-design:${messageId}`;

/** Restyle only existing, explicitly configured messages; never send a replacement. */
export async function refreshConfiguredPanelDesigns(client, onlyGuildId = null) {
    const summary = { refreshed: 0, skipped: 0, errors: 0, urls: [] };
    const attempt = async task => {
        try { await task(); }
        catch (error) {
            summary.errors += 1;
            logger.warn('Could not refresh configured panel design:', error.message);
        }
    };
    const refresh = async (guild, channelId, messageId, build, marker = null, beforeEdit = null, revision = PANEL_DESIGN_REVISION) => {
        if (isCommunityGuild(guild.id) && embedMotionState(guild.id).ready) revision += `:motion-v1-${embedMotionState(guild.id).enabled}:${motionArtwork(guild.id)?.thumbnailUrl || 'static'}`;
        const community = cachedCommunityConfig(guild.id);
        const crownRevision=embedCrownRevision(guild.id);
        if(crownRevision!=='none')revision += `:crown-${crownRevision}`;
        if (community && marker?.buttonCustomId === 'create_ticket') revision += `:categories-${community.features.ticketCategories}-${Object.values(community.ticketButtons).join('-')}`;
        if (!channelId || !messageId) { summary.skipped += 1; return; }
        const key = panelDesignKey(guild.id, messageId);
        if (await client.db.get(key) === revision) { summary.skipped += 1; return; }
        // Fetch exact IDs. Scanning could select a different reaction-role panel.
        const channel = await guild.channels.fetch(channelId);
        const message = channel?.messages ? await channel.messages.fetch(messageId) : null;
        if (!message || message.author?.id !== client.user.id || (marker && !messageHasPanelMarker(message, marker))) {
            summary.skipped += 1;
            return;
        }
        if (beforeEdit) await beforeEdit(message);
        await message.edit(runWithMessageGuild(guild.id, () => build(message, channel)));
        if (await client.db.set(key, revision) === false) throw new Error('Panel design revision could not be saved');
        summary.refreshed += 1;
        if (message.url) summary.urls.push(message.url);
    };

    for (const guild of client.guilds.cache.values()) {
        if (onlyGuildId && guild.id !== onlyGuildId) continue;
        await attempt(async () => {
            const config = await getGuildConfig(client, guild.id);
            await attempt(() => refresh(guild, config.ticketPanelChannelId, config.ticketPanelMessageId,
                message => createSupportPanelMessage(config, guild.iconURL?.() || null, message), { buttonCustomId: 'create_ticket' }));
            await attempt(() => refresh(guild, config.verification?.channelId, config.verification?.messageId,
                () => buildVerificationPanelMessage(config.verification, guild), { buttonCustomId: 'verify_user' }));
        });
        await attempt(async () => {
            const panels = await getAllReactionRoleMessages(client, guild.id);
            for (const panel of panels) await attempt(() => refresh(guild, panel.channelId, panel.messageId,
                () => buildReactionRolePanelMessage(panel, guild), { selectCustomId: 'reaction_roles' }, async message => {
                    preserveReactionRolePanelText(panel, message);
                    if (await client.db.set(getReactionRoleKey(guild.id, panel.messageId), panel) === false) {
                        throw new Error('Reaction role panel text could not be saved');
                    }
                }));
        });
        await attempt(async () => {
            const giveaways = await getGuildGiveaways(client, guild.id);
            for (const stored of giveaways) await attempt(() => Mutex.runExclusive(`giveaway:${stored.messageId}`, async () => {
                // Coordinate with entry updates and re-read the stored result before rendering.
                const current = (await getGuildGiveaways(client, guild.id)).find(item => item.messageId === stored.messageId);
                if (!current) { summary.skipped += 1; return; }
                const ended = Boolean(current.ended || current.isEnded);
                const status = ended ? (current.rerolledAt ? 'reroll' : 'ended') : 'active';
                const winners = Array.isArray(current.winnerIds) ? current.winnerIds : [];
                await refresh(guild, current.channelId, current.messageId, (message, channel) => toContainerMessage({
                    ...withGiveawayArtwork(createGiveawayEmbed(current, status, winners), channel, message),
                    components: [createGiveawayButtons(ended)],
                }), null, null, GIVEAWAY_DESIGN_REVISION);
            }));
        });
    }
    return summary;
}
