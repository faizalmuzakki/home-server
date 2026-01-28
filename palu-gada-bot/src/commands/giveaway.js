import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createGiveaway, getGiveaway, getActiveGiveaways, getExpiredGiveaways, endGiveaway, addGiveawayEntry, getGiveawayEntries } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Create and manage giveaways')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a new giveaway')
                .addStringOption(option =>
                    option
                        .setName('prize')
                        .setDescription('What are you giving away?')
                        .setRequired(true)
                        .setMaxLength(200)
                )
                .addStringOption(option =>
                    option
                        .setName('duration')
                        .setDescription('Duration (e.g., 1h, 30m, 1d, 1w)')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('winners')
                        .setDescription('Number of winners (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('End a giveaway early')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('Message ID of the giveaway')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Reroll a giveaway winner')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('Message ID of the giveaway')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List active giveaways')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'start') {
            const prize = interaction.options.getString('prize');
            const durationStr = interaction.options.getString('duration');
            const winnerCount = interaction.options.getInteger('winners') || 1;

            // Parse duration
            const duration = parseDuration(durationStr);
            if (!duration) {
                return interaction.reply({
                    content: 'Invalid duration format! Use formats like: 30m, 1h, 12h, 1d, 1w',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const endsAt = new Date(Date.now() + duration);

            await interaction.deferReply();

            // Create the giveaway embed
            const embed = createGiveawayEmbed(prize, endsAt, winnerCount, interaction.user, 0);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('giveaway_enter')
                        .setLabel('🎉 Enter Giveaway')
                        .setStyle(ButtonStyle.Primary)
                );

            const message = await interaction.editReply({
                embeds: [embed],
                components: [row],
            });

            // Store in database
            createGiveaway(
                interaction.guildId,
                interaction.channelId,
                message.id,
                prize,
                winnerCount,
                endsAt.toISOString(),
                interaction.user.id
            );

        } else if (subcommand === 'end') {
            const messageId = interaction.options.getString('message_id');
            const giveaway = getGiveaway(messageId);

            if (!giveaway) {
                return interaction.reply({
                    content: 'Giveaway not found!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (!giveaway.active) {
                return interaction.reply({
                    content: 'This giveaway has already ended!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.deferReply();

            // End the giveaway
            await pickWinners(interaction, giveaway);

            await interaction.editReply({
                content: '🎉 Giveaway ended!',
            });

        } else if (subcommand === 'reroll') {
            const messageId = interaction.options.getString('message_id');
            const giveaway = getGiveaway(messageId);

            if (!giveaway) {
                return interaction.reply({
                    content: 'Giveaway not found!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (giveaway.active) {
                return interaction.reply({
                    content: 'This giveaway is still active! End it first.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.deferReply();

            // Get entries and pick new winner
            const entries = getGiveawayEntries(messageId);

            if (entries.length === 0) {
                return interaction.editReply({
                    content: 'No entries to reroll from!',
                });
            }

            const winnerEntry = entries[Math.floor(Math.random() * entries.length)];

            try {
                const winner = await interaction.client.users.fetch(winnerEntry.user_id);
                await interaction.editReply({
                    content: `🎉 The new winner is ${winner}! Congratulations!`,
                });
            } catch {
                await interaction.editReply({
                    content: 'Failed to pick a new winner.',
                });
            }

        } else if (subcommand === 'list') {
            const giveaways = getActiveGiveaways(interaction.guildId);

            if (giveaways.length === 0) {
                return interaction.reply({
                    content: 'No active giveaways in this server.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const entries = giveaways.map((g, index) => {
                const endsAt = new Date(g.ends_at);
                const timeLeft = formatTimeLeft(endsAt - Date.now());
                return `**${index + 1}.** ${g.prize}\n   Ends in: ${timeLeft} | [Jump to message](https://discord.com/channels/${g.guild_id}/${g.channel_id}/${g.message_id})`;
            });

            const embed = {
                color: 0xEB459E,
                title: '🎉 Active Giveaways',
                description: entries.join('\n\n'),
                footer: {
                    text: `${giveaways.length} active giveaway${giveaways.length === 1 ? '' : 's'}`,
                },
            };

            await interaction.reply({ embeds: [embed] });
        }
    },

    // Button handler for giveaway entries
    async handleButton(interaction) {
        if (interaction.customId !== 'giveaway_enter') return false;

        const giveaway = getGiveaway(interaction.message.id);

        if (!giveaway) {
            await interaction.reply({
                content: 'This giveaway no longer exists!',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (!giveaway.active) {
            await interaction.reply({
                content: 'This giveaway has ended!',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        // Check if already entered
        const entries = getGiveawayEntries(interaction.message.id);
        const alreadyEntered = entries.some(e => e.user_id === interaction.user.id);

        if (alreadyEntered) {
            await interaction.reply({
                content: 'You have already entered this giveaway!',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        // Add entry
        addGiveawayEntry(interaction.message.id, interaction.user.id);

        // Update the embed with new entry count
        const newCount = entries.length + 1;
        const endsAt = new Date(giveaway.ends_at);
        const embed = createGiveawayEmbed(
            giveaway.prize,
            endsAt,
            giveaway.winner_count,
            { id: giveaway.host_id },
            newCount
        );

        // Fetch host user for embed
        try {
            const host = await interaction.client.users.fetch(giveaway.host_id);
            embed.footer = {
                text: `Hosted by ${host.tag} • ${newCount} entries`,
                icon_url: host.displayAvatarURL({ dynamic: true }),
            };
        } catch {
            embed.footer.text = `${newCount} entries`;
        }

        await interaction.update({ embeds: [embed] });

        await interaction.followUp({
            content: '🎉 You have entered the giveaway! Good luck!',
            flags: MessageFlags.Ephemeral,
        });

        return true;
    },
};

function parseDuration(str) {
    const match = str.match(/^(\d+)(m|h|d|w)$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit];
}

function formatTimeLeft(ms) {
    if (ms <= 0) return 'Ended';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

function createGiveawayEmbed(prize, endsAt, winnerCount, host, entryCount) {
    const timeLeft = formatTimeLeft(endsAt - Date.now());

    return {
        color: 0xEB459E,
        title: '🎉 GIVEAWAY 🎉',
        description: `**${prize}**\n\nReact with 🎉 or click the button below to enter!`,
        fields: [
            {
                name: 'Ends In',
                value: timeLeft,
                inline: true,
            },
            {
                name: 'Winners',
                value: `${winnerCount}`,
                inline: true,
            },
            {
                name: 'Entries',
                value: `${entryCount}`,
                inline: true,
            },
        ],
        footer: {
            text: `Hosted by ${host.tag || 'Unknown'} • ${entryCount} entries`,
        },
        timestamp: endsAt.toISOString(),
    };
}

export async function pickWinners(interaction, giveaway) {
    const entries = getGiveawayEntries(giveaway.message_id);

    endGiveaway(giveaway.message_id);

    if (entries.length === 0) {
        // Update the giveaway message
        try {
            const channel = await interaction.client.channels.fetch(giveaway.channel_id);
            const message = await channel.messages.fetch(giveaway.message_id);

            const embed = {
                color: 0x747F8D,
                title: '🎉 GIVEAWAY ENDED 🎉',
                description: `**${giveaway.prize}**\n\nNo winners - no one entered!`,
                timestamp: new Date().toISOString(),
            };

            await message.edit({
                embeds: [embed],
                components: [],
            });
        } catch (error) {
            console.error('[ERROR] Failed to update giveaway message:', error);
        }
        return;
    }

    // Pick random winners using Fisher-Yates shuffle for fair selection
    const winners = [];
    const shuffled = [...entries];
    // Fisher-Yates shuffle for uniform randomness
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const winnerCount = Math.min(giveaway.winner_count, shuffled.length);

    for (let i = 0; i < winnerCount; i++) {
        winners.push(shuffled[i].user_id);
    }

    // Fetch winner users
    const winnerUsers = [];
    for (const winnerId of winners) {
        try {
            const user = await interaction.client.users.fetch(winnerId);
            winnerUsers.push(user);
        } catch {
            // User not found
        }
    }

    // Update the giveaway message
    try {
        const channel = await interaction.client.channels.fetch(giveaway.channel_id);
        const message = await channel.messages.fetch(giveaway.message_id);

        const winnerMentions = winnerUsers.map(u => `${u}`).join(', ') || 'Could not determine winners';

        const embed = {
            color: 0x57F287,
            title: '🎉 GIVEAWAY ENDED 🎉',
            description: `**${giveaway.prize}**\n\n**Winner${winnerUsers.length > 1 ? 's' : ''}:** ${winnerMentions}`,
            footer: {
                text: `${entries.length} total entries`,
            },
            timestamp: new Date().toISOString(),
        };

        await message.edit({
            embeds: [embed],
            components: [],
        });

        // Send a follow-up message mentioning winners
        if (winnerUsers.length > 0) {
            await channel.send({
                content: `🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`,
            });
        }
    } catch (error) {
        console.error('[ERROR] Failed to update giveaway message:', error);
    }
}

export async function checkGiveaways(client) {
    // Check for expired giveaways and automatically end them
    // Note: The main giveaway checker runs in index.js via checkEndedGiveaways()
    // This function provides an alternative entry point for the same functionality
    try {
        const expiredGiveaways = getExpiredGiveaways();

        for (const giveaway of expiredGiveaways) {
            try {
                console.log(`[INFO] Auto-ending expired giveaway: ${giveaway.prize} (${giveaway.message_id})`);

                // Fetch the channel and create a mock interaction-like object for pickWinners
                const channel = await client.channels.fetch(giveaway.channel_id);
                if (!channel) {
                    console.error(`[ERROR] Could not find channel ${giveaway.channel_id} for giveaway ${giveaway.message_id}`);
                    endGiveaway(giveaway.message_id); // Mark as ended even if we can't announce
                    continue;
                }

                // Create a minimal interaction-like object for pickWinners
                const mockInteraction = {
                    client,
                    editReply: async () => { }, // No-op since this is automated
                };

                await pickWinners(mockInteraction, giveaway);
            } catch (error) {
                console.error(`[ERROR] Failed to auto-end giveaway ${giveaway.message_id}:`, error);
                // Mark as ended to prevent infinite retry
                endGiveaway(giveaway.message_id);
            }
        }
    } catch (error) {
        console.error('[ERROR] Failed to check giveaways:', error);
    }
}
