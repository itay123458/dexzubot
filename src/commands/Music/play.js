import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery } from '../../services/music/musicActions.js';
import { selectSearchTrack } from '../../services/music/searchSelection.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption((opt) =>
            opt.setName('query').setDescription('Song name and artist (choose a result), or supported URL').setRequired(true),
        ),

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        try {
            const result = await playQuery(client, interaction, interaction.options.getString('query'), {
                chooseTrack: tracks => selectSearchTrack(interaction, tracks),
            });
            if (result.cancelled) return;
            await InteractionHelper.safeEditReply(interaction, { content: '', components: [], embeds: [result.embed], allowedMentions: { parse: [] } });
        } catch (error) {
            await InteractionHelper.safeEditReply(interaction, {
                content: 'The play request could not be completed. See the error details below.', embeds: [], components: [],
            });
            throw error; // Preserve the shared command error boundary.
        }
    },
};
