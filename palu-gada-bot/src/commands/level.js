import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getUserLevel, calculateLevel, xpForLevel } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('View your level and XP')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check (defaults to yourself)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;

        if (user.bot) {
            return interaction.reply({
                content: 'Bots don\'t have levels!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const levelData = getUserLevel(interaction.guildId, user.id);

        if (!levelData || levelData.xp === 0) {
            return interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: `📊 ${user.tag}'s Level`,
                    description: user.id === interaction.user.id
                        ? 'You haven\'t earned any XP yet! Start chatting to gain XP.'
                        : `${user.tag} hasn't earned any XP yet.`,
                }],
            });
        }

        const currentLevel = levelData.level;
        const currentXP = levelData.xp;
        const xpForCurrentLevel = xpForLevel(currentLevel);
        const xpForNextLevel = xpForLevel(currentLevel + 1);
        const xpInLevel = currentXP - xpForCurrentLevel;
        const xpNeeded = xpForNextLevel - xpForCurrentLevel;
        const progress = Math.floor((xpInLevel / xpNeeded) * 100);

        const progressBar = createProgressBar(progress);

        const embed = {
            color: 0x5865F2,
            author: {
                name: `${user.tag}'s Level`,
                icon_url: user.displayAvatarURL({ dynamic: true }),
            },
            thumbnail: {
                url: user.displayAvatarURL({ dynamic: true, size: 256 }),
            },
            fields: [
                {
                    name: '📊 Level',
                    value: `**${currentLevel}**`,
                    inline: true,
                },
                {
                    name: '✨ Total XP',
                    value: `**${currentXP.toLocaleString()}**`,
                    inline: true,
                },
                {
                    name: '💬 Messages',
                    value: `**${levelData.messages.toLocaleString()}**`,
                    inline: true,
                },
                {
                    name: `Progress to Level ${currentLevel + 1}`,
                    value: `${progressBar}\n${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} XP (${progress}%)`,
                    inline: false,
                },
            ],
            footer: {
                text: `${xpNeeded - xpInLevel} XP until next level`,
            },
            timestamp: new Date().toISOString(),
        };

        await interaction.reply({ embeds: [embed] });
    },
};

function createProgressBar(percentage, length = 20) {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}
