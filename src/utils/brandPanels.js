import { createEmbed } from './embeds.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { toContainerMessage } from './panelLayout.js';
import { motionArtwork, currentMessageGuild } from '../services/embedMotionService.js';

export const TICKET_PANEL_MESSAGE_MAX_LENGTH = 2000;

// Reuse the same support presentation for setup, edits, and reposts.
export function createSupportPanelEmbed(config = {}, thumbnail = null, guildId = currentMessageGuild()) {
  return createEmbed({
    title: 'Support Tickets',
    description: config.ticketPanelMessage || 'Welcome to DexzuBot support. Open a private ticket and our team will help you.',
    color: 'primary',
    guildId,
    thumbnail: motionArtwork(guildId)?.thumbnailUrl || thumbnail,
    fields: [
      { name: 'Community support', value: 'Questions, access issues, or help finding your way around the dungeon.' },
      { name: 'Reports & concerns', value: 'Share the details and any relevant evidence privately with the team.' },
      { name: 'Before you open a ticket', value: 'Describe what you need clearly. Use the button below to start your conversation.' },
    ],
    footer: 'DexzuBot · Private support',
  });
}

export function createSupportPanelMessage(config = {}, thumbnail = null, existingMessage = null, guildId = existingMessage?.guildId || currentMessageGuild()) {
  const embed = createSupportPanelEmbed(config, thumbnail, guildId)
    .setTitle('💎 Community Support')
    .setFields(
      { name: '🛟 General support', value: 'Questions, server help, access issues, or anything you need a hand with.' },
      { name: '🛡️ Reports & concerns', value: 'Privately share a concern with the team. Include clear details and evidence where possible.' },
      { name: '🤝 Community requests', value: 'Have an idea or a collaboration request? Tell the team about it in your ticket.' },
    )
    .setFooter({ text: 'Choose the button below to open a private conversation with the team.' });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId('create_ticket').setLabel(config.ticketButtonLabel || 'Open support ticket')
    .setEmoji('📩').setStyle(ButtonStyle.Primary));
  const payload = { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
  try {
    return toContainerMessage(payload);
  } catch (error) {
    if (!(error instanceof RangeError) || !error.message.includes('4000-character')) throw error;
    // Legacy setup accepted longer descriptions. Keep them intact unless Discord
    // has already permanently converted this message to Components V2.
    if (!existingMessage?.flags?.has(MessageFlags.IsComponentsV2)) return payload;
    // A snapshot restore can bring old text back after conversion. Shorten only
    // its display; never rewrite the stored instructions during presentation.
    embed.setDescription(`${embed.data.description.slice(0, TICKET_PANEL_MESSAGE_MAX_LENGTH)}\n\n*Display shortened. Staff can update the instructions in /ticket dashboard.*`);
    return toContainerMessage(payload);
  }
}
