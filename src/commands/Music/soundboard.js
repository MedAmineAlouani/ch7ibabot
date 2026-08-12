import {
    SlashCommandBuilder,
    MessageFlags,
} from 'discord.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

import { successEmbed } from '../../utils/embeds.js';

import {
    joinVoiceChannel,
    replyMusicSuccess,
} from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',

    data: new SlashCommandBuilder()
        .setName('soundboard')
        .setDescription('Play one of this server Soundboard sounds')
        .addStringOption((option) =>
            option
                .setName('sound')
                .setDescription('Name of the Soundboard sound')
                .setRequired(true)
        ),

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });

        // User must be in a VC
        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
            throw new TitanBotError(
                'User not in voice channel',
                ErrorTypes.USER_INPUT,
                'You need to be in a voice channel first.'
            );
        }

        /*
         * This uses your existing Riffy/Lavalink connection.
         *
         * If the bot isn't connected, it joins.
         * If it is connected to another VC, your existing
         * joinVoiceChannel() function moves it.
         */
        await joinVoiceChannel(client, interaction);

        // Give Discord a moment to update the bot voice state.
        let attempts = 0;

        while (
            interaction.guild.members.me?.voice?.channelId !== voiceChannel.id &&
            attempts < 30
        ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            attempts++;
        }

        const botVoiceState = interaction.guild.members.me?.voice;

        if (botVoiceState?.channelId !== voiceChannel.id) {
            throw new TitanBotError(
                'Bot voice connection not ready',
                ErrorTypes.DISCORD_API,
                'I could not finish connecting to your voice channel.'
            );
        }

        // Discord will reject Soundboard playback if the bot is deafened/muted.
        if (
            botVoiceState.deaf ||
            botVoiceState.selfDeaf ||
            botVoiceState.mute ||
            botVoiceState.suppress
        ) {
            throw new TitanBotError(
                'Bot voice state prevents Soundboard',
                ErrorTypes.PERMISSION,
                'I am muted or deafened in the voice channel, so I cannot use Soundboard.'
            );
        }

        // Get server Soundboard sounds
        const sounds = await interaction.guild.soundboardSounds.fetch();

        const requestedName = interaction.options
            .getString('sound', true)
            .trim()
            .toLowerCase();

        // First try exact match
        let sound = sounds.find(
            (s) =>
                s.available !== false &&
                s.name.toLowerCase() === requestedName
        );

        // Then allow partial matching
        if (!sound) {
            sound = sounds.find(
                (s) =>
                    s.available !== false &&
                    s.name.toLowerCase().includes(requestedName)
            );
        }

        if (!sound) {
            const availableSounds = sounds
                .filter((s) => s.available !== false)
                .map((s) => s.name)
                .slice(0, 20)
                .join(', ');

            throw new TitanBotError(
                'Sound not found',
                ErrorTypes.USER_INPUT,
                availableSounds
                    ? `I couldn't find that sound.\n\nAvailable sounds: **${availableSounds}**`
                    : 'I could not find any available Soundboard sounds in this server.'
            );
        }

        // Play the ACTUAL Discord Soundboard sound
        await voiceChannel.sendSoundboardSound(sound);

        const embed = successEmbed(
            'Soundboard',
            `🔊 Played **${sound.name}** in **${voiceChannel.name}**.`
        );

        await replyMusicSuccess(interaction, embed);
    },
};
