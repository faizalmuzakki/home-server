import { SlashCommandBuilder } from 'discord.js';
import { getLeaderboard, getTopBalances } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the server leaderboard')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Leaderboard type')
                .setRequired(false)
                .addChoices(
                    { name: 'Levels (Server)', value: 'levels' },
                    { name: 'Economy (Global)', value: 'economy' }
                )
        ),

    async execute(interaction) {
        const type = interaction.options.getString('type') || 'levels';

        await interaction.deferReply();

        if (type === 'levels') {
            const leaderboard = getLeaderboard(interaction.guildId, 10);

            if (leaderboard.length === 0) {
                return interaction.editReply({
                    content: 'No one has earned XP yet! Start chatting to appear on the leaderboard.',
                });
            }

            // Fetch user data for each entry
            const entries = await Promise.all(
                leaderboard.map(async (entry, index) => {
                    let username = 'Unknown User';
                    try {
                        const user = await interaction.client.users.fetch(entry.user_id);
                        username = user.tag;
                    } catch {
                        // User not found
                    }

                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;

                    return `${medal} ${username}\nLevel ${entry.level} • ${entry.xp.toLocaleString()} XP`;
                })
            );

            // Find user's position
            const userEntry = leaderboard.find(e => e.user_id === interaction.user.id);
            let userPosition = null;
            if (!userEntry) {
                // User not in top 10, would need to query their position
                userPosition = 'Not ranked';
            } else {
                userPosition = `#${leaderboard.indexOf(userEntry) + 1}`;
            }

            const embed = {
                color: 0x5865F2,
                title: `🏆 ${interaction.guild.name} Leaderboard`,
                description: entries.join('\n\n'),
                footer: {
                    text: `Your position: ${userPosition}`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });

        } else if (type === 'economy') {
            const topBalances = getTopBalances(10);

            if (topBalances.length === 0) {
                return interaction.editReply({
                    content: 'No one has any coins yet! Use `/daily` to get started.',
                });
            }

            // Fetch user data for each entry
            const entries = await Promise.all(
                topBalances.map(async (entry, index) => {
                    let username = 'Unknown User';
                    try {
                        const user = await interaction.client.users.fetch(entry.user_id);
                        username = user.tag;
                    } catch {
                        // User not found
                    }

                    const total = entry.balance + entry.bank;
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;

                    return `${medal} ${username}\n💰 ${total.toLocaleString()} coins`;
                })
            );

            const embed = {
                color: 0xFEE75C,
                title: '🏆 Global Economy Leaderboard',
                description: entries.join('\n\n'),
                footer: {
                    text: 'Showing top 10 richest users globally',
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
