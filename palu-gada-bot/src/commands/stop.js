import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, deleteQueue } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playing and clear the queue'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue) {
            return interaction.reply({
                content: 'There is no music playing!',
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

        deleteQueue(interaction.guildId);

        await interaction.reply({
            embeds: [{
                color: 0xff0000,
                title: '⏹️ Stopped',
                description: 'Music stopped and queue cleared. Goodbye!',
            }],
        });
    },
};
