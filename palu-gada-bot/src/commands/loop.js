import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, toggleLoop } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Toggle loop mode for the current song'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || !queue.playing) {
            return interaction.reply({
                content: 'There is no song currently playing!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const member = interaction.member;
        if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannel.id) {
            return interaction.reply({
                content: 'You need to be in the same voice channel as the bot!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const isLooping = toggleLoop(queue);

        await interaction.reply({
            embeds: [{
                color: isLooping ? 0x00ff00 : 0xff0000,
                title: isLooping ? '🔁 Loop Enabled' : '➡️ Loop Disabled',
                description: isLooping
                    ? `Now looping **${queue.songs[0]?.title || 'Unknown'}**`
                    : 'Loop mode has been disabled',
            }],
        });
    },
};
