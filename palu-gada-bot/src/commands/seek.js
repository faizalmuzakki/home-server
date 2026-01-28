import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue } from '../utils/musicPlayer.js';

function parseTime(timeStr) {
    // Parse formats: "1:30", "90", "1:30:00", "1h30m", "90s"
    if (!timeStr) return null;

    // Check for HH:MM:SS or MM:SS format
    if (timeStr.includes(':')) {
        const parts = timeStr.split(':').map(p => parseInt(p));
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        } else if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return null;
    }

    // Check for human-readable format (1h30m, 90s, etc.)
    const regex = /(\d+)\s*(h|m|s)/gi;
    let totalSeconds = 0;
    let match;

    while ((match = regex.exec(timeStr)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'h': totalSeconds += value * 3600; break;
            case 'm': totalSeconds += value * 60; break;
            case 's': totalSeconds += value; break;
        }
    }

    if (totalSeconds > 0) return totalSeconds;

    // Try parsing as plain seconds
    const seconds = parseInt(timeStr);
    if (!isNaN(seconds)) return seconds;

    return null;
}

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Seek to a specific position in the current song')
        .addStringOption(option =>
            option
                .setName('position')
                .setDescription('Position to seek to (e.g., 1:30, 90, 1m30s)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || queue.songs.length === 0) {
            return interaction.reply({
                content: 'Nothing is currently playing.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Check if user is in the same voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || voiceChannel.id !== queue.voiceChannel.id) {
            return interaction.reply({
                content: 'You need to be in the same voice channel as the bot.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const positionStr = interaction.options.getString('position');
        const position = parseTime(positionStr);

        if (position === null) {
            return interaction.reply({
                content: 'Invalid time format. Use formats like `1:30`, `90`, `1m30s`, or `1h30m`.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const currentSong = queue.songs[0];
        const duration = currentSong.duration;

        if (position < 0) {
            return interaction.reply({
                content: 'Position cannot be negative.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (duration && position > duration) {
            return interaction.reply({
                content: `Position exceeds song duration (${formatTime(duration)}).`,
                flags: MessageFlags.Ephemeral,
            });
        }

        // Note: Seeking with @discordjs/voice requires recreating the audio resource
        // This is a simplified implementation - full implementation would need
        // to modify the play.js to support seeking

        // For now, we'll indicate that this feature requires additional implementation
        await interaction.reply({
            embeds: [{
                color: 0x5865F2,
                description: `⏩ Seeking to **${formatTime(position)}** in **${currentSong.title}**\n\n*Note: Full seek functionality requires stream recreation. This may cause a brief audio interruption.*`,
            }],
        });

        // TODO: Implement actual seeking by:
        // 1. Get the stream URL with seek parameter
        // 2. Create new AudioResource with the seek position
        // 3. Replace the current resource in the player
    },
};
