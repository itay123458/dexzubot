import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { assertFoodGuild, eatFood, getFoodCollection } from '../../services/foodCollectionService.js';
import { foodCollectionButton, foodResultEmbed, foodCollectionEmbed, foodGuideEmbed } from '../../services/foodCollectionUi.js';

export default {
  slashOnly: true, betaOnly: true,
  data: new SlashCommandBuilder().setName('eat').setDescription('Eat a mystery food and grow your collection').setDMPermission(false)
    .addStringOption(option => option.setName('action').setDescription('Eat, view your collection, or read the guide')
      .addChoices({ name: 'Eat a random food', value: 'eat' }, { name: 'My collection', value: 'collection' }, { name: 'Guide', value: 'guide' })),
  async execute(interaction, _config, client) {
    const action = interaction.options.getString('action') || 'eat';
    if (!await InteractionHelper.safeDefer(interaction, action === 'eat' ? {} : { flags: MessageFlags.Ephemeral })) return;
    assertFoodGuild(interaction.guildId);
    if (action === 'guide') return InteractionHelper.safeEditReply(interaction, { embeds: [foodGuideEmbed(interaction.guildId)] });
    if (action === 'collection') {
      const collection = await getFoodCollection(client, interaction.guildId, interaction.user.id);
      return InteractionHelper.safeEditReply(interaction, { embeds: [foodCollectionEmbed(client, interaction.guildId, collection)] });
    }
    const result = await eatFood(client, interaction.guildId, interaction.user.id, interaction.id);
    if (result.kind === 'cooldown') return InteractionHelper.safeEditReply(interaction, { content: `Still chewing! Try again in ${result.retryAfterSeconds} seconds.`, components: [foodCollectionButton()] });
    if (result.kind === 'disabled') return InteractionHelper.safeEditReply(interaction, { content: 'New meals are paused in this server. Your collection is still saved.', components: [foodCollectionButton()] });
    return InteractionHelper.safeEditReply(interaction, { embeds: [foodResultEmbed(client, interaction.guildId, result)], components: [foodCollectionButton()], allowedMentions: { parse: [] } });
  },
};
