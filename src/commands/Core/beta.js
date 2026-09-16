import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { toContainerMessage } from '../../utils/panelLayout.js';

export default {
  betaOnly: true,
  data: new SlashCommandBuilder()
    .setName('beta')
    .setDescription('View the DexzuBot beta server status and testing scope')
    .setDMPermission(false),
  async execute(interaction) {
    await InteractionHelper.safeReply(interaction, toContainerMessage({
      flags: MessageFlags.Ephemeral,
      embeds: [createEmbed({
        title: 'DexzuBot Beta',
        description: 'This server is the configured space for testing future DexzuBot commands.',
        fields: [
          { name: '🧪 Available now', value: 'Beta access and this status command are enabled. No experimental releases have been added yet.' },
          { name: '💎 Same DexzuBot', value: 'This server uses the same bot application and running process as the main server. It is not a separate deployment.' },
          { name: '🔒 Testing scope', value: 'Commands marked beta-only register and run only in this server. Normal commands still follow this server’s settings and permissions.' },
        ],
        footer: 'DexzuBot • Beta workspace',
      })],
    }));
  },
};
