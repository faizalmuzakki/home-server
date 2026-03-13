import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { getLeaderboard, getTopBalances, getUserRank, getLeaderboardCount, getEconomyCount } from '../database/models.js';

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
        )
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Page number')
                .setRequired(false)
                .setMinValue(1)
        ),

    async execute(interaction) {
        const type = interaction.options.getString('type') || 'levels';
        let page = interaction.options.getInteger('page') || 1;
        const limit = 10;

        await interaction.deferReply();

        const createLeaderboardEmbed = async (selectedType, selectedPage) => {
            const offset = (selectedPage - 1) * limit;
            let entries = [];
            let totalItems = 0;
            let title = '';
            let color = 0x5865F2;
            let userPosition = 'Not ranked';

            if (selectedType === 'levels') {
                const leaderboard = getLeaderboard(interaction.guildId, limit, offset);
                totalItems = getLeaderboardCount(interaction.guildId);
                title = `🏆 ${interaction.guild.name} Leaderboard`;
                color = 0x5865F2;

                if (leaderboard.length === 0 && selectedPage === 1) {
                    return { content: 'No one has earned XP yet! Start chatting to appear on the leaderboard.', embeds: [], components: [] };
                }

                // Fetch user data for each entry
                entries = await Promise.all(
                    leaderboard.map(async (entry, index) => {
                        let username = 'Unknown User';
                        try {
                            const user = await interaction.client.users.fetch(entry.user_id);
                            username = user.tag;
                        } catch {
                            // User not found
                        }

                        const rank = offset + index + 1;
                        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;

                        return `${medal} ${username}\nLevel ${entry.level} • ${entry.xp.toLocaleString()} XP`;
                    })
                );

                // Find user's position
                const rank = getUserRank(interaction.guildId, interaction.user.id);
                userPosition = rank ? `#${rank}` : 'Not ranked';

            } else if (selectedType === 'economy') {
                const topBalances = getTopBalances(limit, offset);
                totalItems = getEconomyCount();
                title = '🏆 Global Economy Leaderboard';
                color = 0xFEE75C;

                if (topBalances.length === 0 && selectedPage === 1) {
                    return { content: 'No one has any coins yet! Use `/daily` to get started.', embeds: [], components: [] };
                }

                // Fetch user data for each entry
                entries = await Promise.all(
                    topBalances.map(async (entry, index) => {
                        let username = 'Unknown User';
                        try {
                            const user = await interaction.client.users.fetch(entry.user_id);
                            username = user.tag;
                        } catch {
                            // User not found
                        }

                        const total = (entry.balance || 0) + (entry.bank || 0);
                        const rank = offset + index + 1;
                        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;

                        return `${medal} ${username}\n💰 ${total.toLocaleString()} coins`;
                    })
                );
            }

            const totalPages = Math.ceil(totalItems / limit) || 1;
            
            // Adjust page if it exceeds total pages
            if (selectedPage > totalPages) selectedPage = totalPages;

            const embed = {
                color,
                title,
                description: entries.join('\n\n') || '*No entries for this page*',
                footer: {
                    text: `Page ${selectedPage} of ${totalPages}${selectedType === 'levels' ? ` • Your position: ${userPosition}` : ''}`,
                },
                timestamp: new Date().toISOString(),
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(selectedPage <= 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(selectedPage >= totalPages)
            );

            return { embeds: [embed], components: [row] };
        };

        const response = await createLeaderboardEmbed(type, page);
        const message = await interaction.editReply(response);

        if (response.components && response.components.length > 0) {
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000,
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: "You can't use these buttons.", ephemeral: true });
                }

                if (i.customId === 'prev') {
                    page--;
                } else if (i.customId === 'next') {
                    page++;
                }

                const updatedResponse = await createLeaderboardEmbed(type, page);
                await i.update(updatedResponse);
            });

            collector.on('end', () => {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('prev').setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(true),
                    new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(true)
                );
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        }
    },
};
