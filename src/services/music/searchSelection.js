import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

function duration(info) {
    if (info.isStream) return 'Live';
    const seconds = Math.floor(Number(info.length || 0) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export async function selectSearchTrack(interaction, tracks) {
    const choices = tracks.slice(0, 10);
    const customId = `music_pick_${interaction.id}`; // Inline collector; no global handler lookup.
    const menu = new StringSelectMenuBuilder().setCustomId(customId)
        .setPlaceholder('Choose the recording you want').setMinValues(1).setMaxValues(1)
        .addOptions(choices.map((track, index) => ({
            label: String(track.info.title || 'Untitled track').slice(0, 100),
            description: `${String(track.info.author || 'Unknown artist').slice(0, 75)} · ${duration(track.info)}`.slice(0, 100),
            value: String(index),
        })));
    await InteractionHelper.safeEditReply(interaction, {
        content: 'Choose a song below. Check the artist and version before selecting. If the original is missing, try the song name plus artist. This menu expires in 60 seconds.',
        embeds: [], components: [new ActionRowBuilder().addComponents(menu)], allowedMentions: { parse: [] },
    });
    const message = await interaction.fetchReply();
    let selected;
    try {
        selected = await message.awaitMessageComponent({
            filter: component => component.customId === customId && component.user.id === interaction.user.id,
            time: 60_000,
        });
    } catch (error) {
        if (error.code !== 'InteractionCollectorError') throw error;
        await InteractionHelper.safeEditReply(interaction, {
            content: 'Song selection expired. Nothing was added. Run `/play` again with the song name and artist.', embeds: [], components: [],
        });
        return null;
    }
    await selected.deferUpdate();
    const value = selected.values[0];
    const track = /^(0|[1-9])$/.test(value) ? choices[Number(value)] : null;
    await InteractionHelper.safeEditReply(interaction, {
        content: track ? 'Adding your selected recording…' : 'That selection is unavailable. Run `/play` again.',
        embeds: [], components: [],
    });
    if (!track) throw new TitanBotError('Invalid music selection', ErrorTypes.USER_INPUT, 'Run /play again to choose a song.');
    return track;
}
