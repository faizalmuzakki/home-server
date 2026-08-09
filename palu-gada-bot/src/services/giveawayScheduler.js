import { getExpiredGiveaways, getGiveawayEntries, endGiveaway } from '../database/models.js';

async function checkEndedGiveaways(client) {
    const expired = getExpiredGiveaways();

    for (const giveaway of expired) {
        try {
            const entries = getGiveawayEntries(giveaway.message_id);
            endGiveaway(giveaway.message_id);

            const channel = await client.channels.fetch(giveaway.channel_id);
            const message = await channel.messages.fetch(giveaway.message_id);

            if (entries.length === 0) {
                const embed = {
                    color: 0x747F8D,
                    title: '🎉 GIVEAWAY ENDED 🎉',
                    description: `**${giveaway.prize}**\n\nNo winners - no one entered!`,
                    timestamp: new Date().toISOString(),
                };
                await message.edit({ embeds: [embed], components: [] });
            } else {
                const winners = [];
                const shuffled = [...entries];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                const winnerCount = Math.min(giveaway.winner_count, shuffled.length);

                for (let i = 0; i < winnerCount; i++) {
                    try {
                        const user = await client.users.fetch(shuffled[i].user_id);
                        winners.push(user);
                    } catch {
                        // User left server or not found
                    }
                }

                const winnerMentions = winners.map(u => `${u}`).join(', ') || 'Could not determine winners';

                const embed = {
                    color: 0x57F287,
                    title: '🎉 GIVEAWAY ENDED 🎉',
                    description: `**${giveaway.prize}**\n\n**Winner${winners.length > 1 ? 's' : ''}:** ${winnerMentions}`,
                    footer: { text: `${entries.length} total entries` },
                    timestamp: new Date().toISOString(),
                };

                await message.edit({ embeds: [embed], components: [] });

                if (winners.length > 0) {
                    await channel.send({
                        content: `🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`,
                    });
                }
            }
        } catch (error) {
            console.error('[ERROR] Failed to end giveaway:', giveaway.id, error);
        }
    }
}

export function start(client) {
    setInterval(() => checkEndedGiveaways(client), 30000);
    console.log('[INFO] Giveaway checker started');
}
