import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
} from 'discord.js';
import { getBotOwners } from '../../config/bot.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

const SUPPORT_SERVER_URL = 'https://discord.gg/bRWS3gVE74';
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@DexzuGtag';

function formatTimestamp(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

async function formatBotOwners(client) {
  const ownerIds = getBotOwners();
  if (ownerIds.length === 0) return 'Not configured';

  const owners = await Promise.all(ownerIds.map(async ownerId => {
    const user = await client.users.fetch(ownerId).catch(() => null);
    return user ? `${user} (${user.username})` : `<@${ownerId}>`;
  }));

  return owners.join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('View information about this server, DexzuBot, and its owners')
    .setDMPermission(false),

  async execute(interaction) {
    await InteractionHelper.safeDefer(interaction);

    try {
      const guild = interaction.guild;
      const serverOwner = await guild.fetchOwner();
      const botOwners = await formatBotOwners(interaction.client);
      const botUser = interaction.client.user;

      const embed = createEmbed({
        title: `${guild.name} Information`,
        description: guild.description || 'Server and DexzuBot information.',
        thumbnail: guild.iconURL({ size: 1024 }),
        color: 'primary',
        fields: [
          { name: 'Server Owner', value: `${serverOwner} (${serverOwner.user.username})`, inline: false },
          { name: 'Members', value: guild.memberCount.toLocaleString(), inline: true },
          { name: 'Channels', value: guild.channels.cache.size.toLocaleString(), inline: true },
          { name: 'Roles', value: guild.roles.cache.size.toLocaleString(), inline: true },
          { name: 'Server Created', value: formatTimestamp(guild.createdAt), inline: false },
          { name: 'Bot', value: `${botUser} (${botUser.username})`, inline: false },
          { name: 'Bot Owners', value: botOwners, inline: false },
          { name: 'Servers', value: interaction.client.guilds.cache.size.toLocaleString(), inline: true },
          { name: 'Commands', value: interaction.client.commands.size.toLocaleString(), inline: true },
          { name: 'Bot Created', value: formatTimestamp(botUser.createdAt), inline: false },
          { name: 'YouTube', value: `[DexzuGtag](${YOUTUBE_CHANNEL_URL})`, inline: false },
        ],
        footer: 'DexzuBot Server Information',
      });

      const links = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('DexzuGtag YouTube')
          .setStyle(ButtonStyle.Link)
          .setURL(YOUTUBE_CHANNEL_URL),
        new ButtonBuilder()
          .setLabel('Support Server')
          .setStyle(ButtonStyle.Link)
          .setURL(SUPPORT_SERVER_URL),
      );

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [links],
      });
    } catch (error) {
      logger.error('Info command error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
          title: 'System Error',
          description: 'Could not load the server information.',
          color: 'error',
        })],
      });
    }
  },
};
