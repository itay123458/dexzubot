import { SlashCommandBuilder } from 'discord.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption((opt) =>
            opt.setName('query').setDescription('Song name or URL').setRequired(true),
        ),

    async execute(interaction, config, client) {
        const deferred = await deferMusicCommand(interaction);
        if (!deferred) {
            return;
        }

        const result = await playQuery(client, interaction, interaction.options.getString('query'));
        await replyMusicSuccess(interaction, result.embed);
    },
};
