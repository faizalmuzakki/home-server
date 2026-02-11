import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, resumeSong } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the paused song'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || !queue.playing) {
            return interaction.reply({
                content: 'There is no song to resume!',
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

        resumeSong(queue);

        await interaction.reply({
            embeds: [{
                color: 0x00ff00,
                title: '▶️ Resumed',
                description: `Resumed **${queue.songs[0]?.title || 'Unknown'}**`,
            }],
        });
    },
};
