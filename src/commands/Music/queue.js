import { SlashCommandBuilder } from 'discord.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildQueueReply } from '../../services/music/musicActions.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue')
        .addIntegerOption((opt) =>
            opt.setName('page').setDescription('Page number').setMinValue(1),
        ),

    async execute(interaction, config, client) {
        if (!await deferMusicCommand(interaction)) return;
        const page = (interaction.options.getInteger('page') || 1) - 1;
        const payload = buildQueueReply(client, interaction.guild.id, page);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: payload.embeds,
            components: payload.components,
        });
    },
};
