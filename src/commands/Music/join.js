import { SlashCommandBuilder } from 'discord.js';

import {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
} from '@discordjs/voice';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',

    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your current voice channel')
        .setDMPermission(false),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);

        /*
         * IMPORTANT:
         *
         * Do NOT rely on interaction.guild.
         * Use guildId and resolve the Guild through the bot client.
         */
        const guildId = interaction.guildId;

        if (!guildId) {
            throw new TitanBotError(
                'No guild ID',
                ErrorTypes.USER_INPUT,
                'This command can only be used inside a server.',
            );
        }

        let guild = client.guilds.cache.get(guildId);

        if (!guild) {
            try {
                guild = await client.guilds.fetch(guildId);
            } catch {
                guild = null;
            }
        }

        if (!guild) {
            throw new TitanBotError(
                'Guild could not be resolved',
                ErrorTypes.DISCORD_API,
                'I could not access this server.',
            );
        }

        /*
         * Get YOUR actual current voice state from Discord.
         */
        let voiceState = guild.voiceStates.cache.get(interaction.user.id);

        if (!voiceState?.channelId) {
            try {
                voiceState = await guild.voiceStates.fetch(
                    interaction.user.id,
                    { force: true },
                );
            } catch {
                voiceState = null;
            }
        }

        const channelId = voiceState?.channelId;

        if (!channelId) {
            throw new TitanBotError(
                'User not in voice channel',
                ErrorTypes.USER_INPUT,
                'You need to be in a voice channel.',
            );
        }

        /*
         * Resolve the actual voice channel.
         */
        let channel = guild.channels.cache.get(channelId);

        if (!channel) {
            try {
                channel = await guild.channels.fetch(channelId);
            } catch {
                channel = null;
            }
        }

        if (!channel?.isVoiceBased()) {
            throw new TitanBotError(
                'Invalid voice channel',
                ErrorTypes.USER_INPUT,
                'I could not find the voice channel you are connected to.',
            );
        }

        if (!channel.joinable) {
            throw new TitanBotError(
                'Voice channel not joinable',
                ErrorTypes.PERMISSION,
                'I cannot join that voice channel. Check my Connect permission.',
            );
        }

        /*
         * Establish a REAL Discord voice connection.
         *
         * This is independent of Riffy/Lavalink.
         *
         * selfDeaf MUST be false because we want to use
         * Discord Soundboard afterward.
         */
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,

            selfDeaf: false,
            selfMute: false,
        });

        /*
         * Wait until Discord confirms that the connection
         * is actually ready.
         */
        try {
            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                20_000,
            );
        } catch {
            connection.destroy();

            throw new TitanBotError(
                'Voice connection failed',
                ErrorTypes.DISCORD_API,
                'I could not connect to the voice channel. Check my voice permissions.',
            );
        }

        const embed = successEmbed(
            'Joined Voice Channel',
            `Connected to **${channel.name}**.`,
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    },
};
