import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue } from '../utils/musicPlayer.js';
import { updateGuildSetting, getGuildSettings } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('View or set the playback volume')
        .addIntegerOption(option =>
            option
                .setName('level')
                .setDescription('Volume level (0-200)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(200)
        ),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        const newVolume = interaction.options.getInteger('level');

        // Get current settings
        const settings = getGuildSettings(interaction.guildId);
        const currentVolume = settings?.volume ?? 100;

        // If no volume specified, show current volume
        if (newVolume === null) {
            const volumeBar = createVolumeBar(currentVolume);

            return interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '🔊 Current Volume',
                    description: `${volumeBar}\n\n**${currentVolume}%**`,
                    footer: {
                        text: 'Use /volume <0-200> to change the volume',
                    },
                }],
            });
        }

        // Check if user is in voice channel
        if (queue) {
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel || voiceChannel.id !== queue.voiceChannel.id) {
                return interaction.reply({
                    content: 'You need to be in the same voice channel as the bot to change volume.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        // Update volume in database
        updateGuildSetting(interaction.guildId, 'volume', newVolume);

        // Apply volume to current player if playing
        if (queue && queue.resource) {
            // Note: Volume control with @discordjs/voice requires an inline volume transformer
            // which needs to be set up when creating the audio resource
            // For now, we'll save the setting for future playback
        }

        const volumeBar = createVolumeBar(newVolume);
        const emoji = newVolume === 0 ? '🔇' : newVolume < 50 ? '🔈' : newVolume < 100 ? '🔉' : '🔊';

        await interaction.reply({
            embeds: [{
                color: 0x5865F2,
                title: `${emoji} Volume ${newVolume > currentVolume ? 'Increased' : newVolume < currentVolume ? 'Decreased' : 'Set'}`,
                description: `${volumeBar}\n\n**${currentVolume}%** → **${newVolume}%**`,
                footer: {
                    text: newVolume > 100 ? '⚠️ Volume above 100% may cause distortion' : '',
                },
            }],
        });
    },
};

function createVolumeBar(volume, length = 20) {
    const filled = Math.round((Math.min(volume, 100) / 100) * length);
    const empty = length - filled;

    let bar = '▓'.repeat(filled) + '░'.repeat(empty);

    // Add overflow indicator for volumes over 100
    if (volume > 100) {
        const overflow = Math.round(((volume - 100) / 100) * 10);
        bar += ' +' + '▓'.repeat(Math.min(overflow, 10));
    }

    return `[${bar}]`;
}
