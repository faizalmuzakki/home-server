import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getEconomy, canClaimDaily, claimDaily } from '../database/models.js';

const BASE_DAILY = 100;
const STREAK_BONUS = 25;
const MAX_STREAK_BONUS = 500;

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily coins'),

    async execute(interaction) {
        const userId = interaction.user.id;

        // Check if user can claim
        if (!canClaimDaily(userId)) {
            const eco = getEconomy(userId);
            // SQLite's CURRENT_TIMESTAMP stores UTC time without timezone indicator
            // Append 'Z' to explicitly parse as UTC (consistent with canClaimDaily in models.js)
            const lastDailyStr = eco.last_daily.endsWith('Z') ? eco.last_daily : eco.last_daily + 'Z';
            const lastDaily = new Date(lastDailyStr);
            const nextDaily = new Date(lastDaily.getTime() + 24 * 60 * 60 * 1000);
            const timeLeft = nextDaily.getTime() - Date.now();

            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

            return interaction.reply({
                embeds: [{
                    color: 0xED4245,
                    title: '⏰ Already Claimed',
                    description: `You've already claimed your daily reward!\n\nCome back in **${hours}h ${minutes}m**.`,
                    footer: {
                        text: 'Daily rewards reset every 24 hours',
                    },
                }],
                flags: MessageFlags.Ephemeral,
            });
        }

        // Calculate reward (base + random bonus)
        const bonus = Math.floor(Math.random() * 50);
        const totalReward = BASE_DAILY + bonus;

        // Claim daily
        claimDaily(userId, totalReward);

        // Get updated balance
        const eco = getEconomy(userId);

        const embed = {
            color: 0x57F287,
            title: '💰 Daily Reward Claimed!',
            description: `You received **${totalReward.toLocaleString()}** coins!`,
            fields: [
                {
                    name: 'Breakdown',
                    value: `Base: ${BASE_DAILY} coins\nBonus: +${bonus} coins`,
                    inline: true,
                },
                {
                    name: 'New Balance',
                    value: `💵 ${eco.balance.toLocaleString()} coins`,
                    inline: true,
                },
            ],
            footer: {
                text: 'Come back tomorrow for more!',
            },
            timestamp: new Date().toISOString(),
        };

        // Add tip occasionally
        if (Math.random() < 0.3) {
            embed.fields.push({
                name: '💡 Tip',
                value: 'Use `/balance` to check your balance or `/leaderboard economy` to see rankings!',
                inline: false,
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
