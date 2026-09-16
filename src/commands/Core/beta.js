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
          { name: '🧪 Available now', value: 'Role management is ready to test: /role add, remove, create, edit, delete, info, list, bulk-add and bulk-remove. /autorole is also available here. Bulk changes and deletion need confirmation.' },
          { name: '💎 Same DexzuBot', value: 'This server uses the same bot application and running process as the main server. It is not a separate deployment.' },
          { name: '🔒 Testing scope', value: 'Commands marked beta-only register and run only in this server. Normal commands still follow this server’s settings and permissions.' },
        ],
        footer: 'DexzuBot • Beta workspace',
      })],
    }));
  },
};
