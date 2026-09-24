import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getFoodCollection } from '../../../services/foodCollectionService.js';
import { foodCollectionEmbed } from '../../../services/foodCollectionUi.js';
export default {
  name: 'eat_collection',
  async execute(interaction, client) {
    if (!await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral })) return;
    const collection = await getFoodCollection(client, interaction.guildId, interaction.user.id);
    return InteractionHelper.safeEditReply(interaction, { embeds: [foodCollectionEmbed(client, interaction.guildId, collection)], allowedMentions: { parse: [] } });
  },
};
