import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { botConfig } from '../config/bot.js';
import { createEmbed } from './embeds.js';
import { toContainerMessage } from './panelLayout.js';

export function buildVerificationPanelMessage(config, guild) {
    const embed = createEmbed({
        guildId: guild.id,
        title: 'Server Verification',
        description: config.message || botConfig.verification.defaultMessage,
        footer: `${guild.name} • Secure community access`,
    });
    const controls = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId('verify_user')
        .setLabel(config.buttonText || botConfig.verification.defaultButtonText)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💎')
        .setDisabled(config.enabled === false));
    return toContainerMessage({ embeds: [embed], components: [controls], allowedMentions: { parse: [] } });
}

// Capture old embed text before its first Components V2 edit. Persist the returned
// fields with the panel so future edits and reposts never depend on message.embeds.
export function preserveReactionRolePanelText(panelData, message) {
    const oldEmbed = message?.embeds?.[0];
    panelData.title ??= oldEmbed?.title || 'Reaction Roles';
    panelData.description ??= oldEmbed?.description || 'Select your roles using the menu below.';
    return panelData;
}

export function buildReactionRolePanelMessage(panelData, guild) {
    const roles = (panelData.roles || []).map(id => guild.roles.cache.get(id)).filter(Boolean).slice(0, 25);
    const embed = createEmbed({
        guildId: guild.id,
        title: panelData.title || 'Reaction Roles',
        description: panelData.description || 'Select your roles using the menu below.',
        fields: [{ name: 'Available Roles', value: roles.length ? roles.map(role => `• <@&${role.id}>`).join('\n') : 'No roles are currently available.' }],
        footer: `${guild.name} • Choose your roles below`,
    });
    const controls = roles.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('reaction_roles')
        .setPlaceholder('Select your roles')
        .setMinValues(0)
        .setMaxValues(roles.length)
        .addOptions(roles.map(role => ({
            label: role.name.substring(0, 100),
            description: `Add/remove the ${role.name} role`.substring(0, 100),
            value: role.id,
            emoji: '💎',
        }))))] : [];
    return toContainerMessage({ embeds: [embed], components: controls, allowedMentions: { parse: [] } });
}
