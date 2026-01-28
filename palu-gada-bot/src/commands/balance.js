import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getEconomy, addBalance, addToBank, transferBalance } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('View or manage your balance')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your balance')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to check (defaults to yourself)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('deposit')
                .setDescription('Deposit coins to your bank')
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Amount to deposit (or "all")')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('withdraw')
                .setDescription('Withdraw coins from your bank')
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Amount to withdraw')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('transfer')
                .setDescription('Transfer coins to another user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to transfer to')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Amount to transfer')
                        .setRequired(true)
                        .setMinValue(1)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            const user = interaction.options.getUser('user') || interaction.user;

            if (user.bot) {
                return interaction.reply({
                    content: 'Bots don\'t have wallets!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const eco = getEconomy(user.id);
            const total = eco.balance + eco.bank;

            const embed = {
                color: 0xFEE75C,
                author: {
                    name: `${user.tag}'s Balance`,
                    icon_url: user.displayAvatarURL({ dynamic: true }),
                },
                fields: [
                    {
                        name: '💵 Wallet',
                        value: `${eco.balance.toLocaleString()} coins`,
                        inline: true,
                    },
                    {
                        name: '🏦 Bank',
                        value: `${eco.bank.toLocaleString()} coins`,
                        inline: true,
                    },
                    {
                        name: '💰 Net Worth',
                        value: `${total.toLocaleString()} coins`,
                        inline: true,
                    },
                ],
                footer: {
                    text: `Total earned: ${eco.total_earned.toLocaleString()} coins`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === 'deposit') {
            const amount = interaction.options.getInteger('amount');
            const eco = getEconomy(interaction.user.id);

            if (amount > eco.balance) {
                return interaction.reply({
                    content: `You don't have enough coins! Your balance: ${eco.balance.toLocaleString()} coins.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Transfer from balance to bank
            addBalance(interaction.user.id, -amount);
            addToBank(interaction.user.id, amount);

            const newEco = getEconomy(interaction.user.id);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '🏦 Deposit Successful',
                    description: `Deposited **${amount.toLocaleString()}** coins to your bank.`,
                    fields: [
                        {
                            name: '💵 Wallet',
                            value: `${newEco.balance.toLocaleString()} coins`,
                            inline: true,
                        },
                        {
                            name: '🏦 Bank',
                            value: `${newEco.bank.toLocaleString()} coins`,
                            inline: true,
                        },
                    ],
                }],
            });

        } else if (subcommand === 'withdraw') {
            const amount = interaction.options.getInteger('amount');
            const eco = getEconomy(interaction.user.id);

            if (amount > eco.bank) {
                return interaction.reply({
                    content: `You don't have enough in your bank! Bank balance: ${eco.bank.toLocaleString()} coins.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Transfer from bank to balance
            addToBank(interaction.user.id, -amount);
            addBalance(interaction.user.id, amount);

            const newEco = getEconomy(interaction.user.id);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '🏦 Withdrawal Successful',
                    description: `Withdrew **${amount.toLocaleString()}** coins from your bank.`,
                    fields: [
                        {
                            name: '💵 Wallet',
                            value: `${newEco.balance.toLocaleString()} coins`,
                            inline: true,
                        },
                        {
                            name: '🏦 Bank',
                            value: `${newEco.bank.toLocaleString()} coins`,
                            inline: true,
                        },
                    ],
                }],
            });

        } else if (subcommand === 'transfer') {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            if (targetUser.bot) {
                return interaction.reply({
                    content: 'You can\'t transfer coins to bots!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (targetUser.id === interaction.user.id) {
                return interaction.reply({
                    content: 'You can\'t transfer coins to yourself!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const success = transferBalance(interaction.user.id, targetUser.id, amount);

            if (!success) {
                const eco = getEconomy(interaction.user.id);
                return interaction.reply({
                    content: `You don't have enough coins! Your balance: ${eco.balance.toLocaleString()} coins.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const senderEco = getEconomy(interaction.user.id);
            const receiverEco = getEconomy(targetUser.id);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '💸 Transfer Successful',
                    description: `Transferred **${amount.toLocaleString()}** coins to ${targetUser}.`,
                    fields: [
                        {
                            name: 'Your New Balance',
                            value: `${senderEco.balance.toLocaleString()} coins`,
                            inline: true,
                        },
                        {
                            name: `${targetUser.tag}'s New Balance`,
                            value: `${receiverEco.balance.toLocaleString()} coins`,
                            inline: true,
                        },
                    ],
                }],
            });
        }
    },
};
