import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { setBirthday, getBirthday, removeBirthday, getUpcomingBirthdays, getTodayBirthdays } from '../database/models.js';

const MONTHS = [
    { name: 'January', value: 1 },
    { name: 'February', value: 2 },
    { name: 'March', value: 3 },
    { name: 'April', value: 4 },
    { name: 'May', value: 5 },
    { name: 'June', value: 6 },
    { name: 'July', value: 7 },
    { name: 'August', value: 8 },
    { name: 'September', value: 9 },
    { name: 'October', value: 10 },
    { name: 'November', value: 11 },
    { name: 'December', value: 12 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Manage birthdays')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set your birthday')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Birth month')
                        .setRequired(true)
                        .addChoices(...MONTHS)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('Birth day')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View a user\'s birthday')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to check')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove your birthday')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('upcoming')
                .setDescription('View upcoming birthdays in this server')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('today')
                .setDescription('View today\'s birthdays')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const month = interaction.options.getInteger('month');
            const day = interaction.options.getInteger('day');

            // Validate day for month
            const daysInMonth = new Date(2024, month, 0).getDate(); // 2024 is a leap year
            if (day > daysInMonth) {
                return interaction.reply({
                    content: `Invalid day! ${MONTHS[month - 1].name} only has ${daysInMonth} days.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            setBirthday(interaction.user.id, interaction.guildId, month, day);

            const monthName = MONTHS[month - 1].name;

            await interaction.reply({
                embeds: [{
                    color: 0xEB459E,
                    title: '🎂 Birthday Set!',
                    description: `Your birthday has been set to **${monthName} ${day}**!`,
                    footer: {
                        text: 'You\'ll receive a special message on your birthday!',
                    },
                }],
            });

        } else if (subcommand === 'view') {
            const user = interaction.options.getUser('user') || interaction.user;
            const birthday = getBirthday(user.id, interaction.guildId);

            if (!birthday) {
                return interaction.reply({
                    content: user.id === interaction.user.id
                        ? 'You haven\'t set your birthday yet! Use `/birthday set` to add it.'
                        : `${user.tag} hasn't set their birthday.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const monthName = MONTHS[birthday.month - 1].name;

            // Calculate days until birthday
            const today = new Date();
            let nextBirthday = new Date(today.getFullYear(), birthday.month - 1, birthday.day);
            if (nextBirthday < today) {
                nextBirthday = new Date(today.getFullYear() + 1, birthday.month - 1, birthday.day);
            }
            const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));

            const embed = {
                color: 0xEB459E,
                author: {
                    name: `${user.tag}'s Birthday`,
                    icon_url: user.displayAvatarURL({ dynamic: true }),
                },
                fields: [
                    {
                        name: '📅 Date',
                        value: `${monthName} ${birthday.day}`,
                        inline: true,
                    },
                    {
                        name: '⏰ Days Until',
                        value: daysUntil === 0 ? '🎉 Today!' : `${daysUntil} days`,
                        inline: true,
                    },
                ],
            };

            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === 'remove') {
            const birthday = getBirthday(interaction.user.id, interaction.guildId);

            if (!birthday) {
                return interaction.reply({
                    content: 'You don\'t have a birthday set.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            removeBirthday(interaction.user.id, interaction.guildId);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Birthday Removed',
                    description: 'Your birthday has been removed from this server.',
                }],
            });

        } else if (subcommand === 'upcoming') {
            const upcoming = getUpcomingBirthdays(interaction.guildId, 10);

            if (upcoming.length === 0) {
                return interaction.reply({
                    content: 'No upcoming birthdays found. Members can use `/birthday set` to add their birthdays!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.deferReply();

            const entries = await Promise.all(
                upcoming.map(async (entry) => {
                    let username = 'Unknown User';
                    try {
                        const user = await interaction.client.users.fetch(entry.user_id);
                        username = user.tag;
                    } catch {
                        // User not found
                    }

                    const monthName = MONTHS[entry.month - 1].name;
                    return `🎂 **${username}** - ${monthName} ${entry.day}`;
                })
            );

            const embed = {
                color: 0xEB459E,
                title: '📅 Upcoming Birthdays',
                description: entries.join('\n'),
                footer: {
                    text: `${upcoming.length} upcoming birthday${upcoming.length === 1 ? '' : 's'}`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'today') {
            const birthdays = getTodayBirthdays(interaction.guildId);

            if (birthdays.length === 0) {
                return interaction.reply({
                    content: 'No birthdays today!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.deferReply();

            const entries = await Promise.all(
                birthdays.map(async (entry) => {
                    let user = null;
                    try {
                        user = await interaction.client.users.fetch(entry.user_id);
                    } catch {
                        return null;
                    }
                    return user;
                })
            );

            const validUsers = entries.filter(u => u !== null);

            if (validUsers.length === 0) {
                return interaction.editReply({
                    content: 'No birthdays today!',
                });
            }

            const embed = {
                color: 0xEB459E,
                title: '🎉 Today\'s Birthdays!',
                description: validUsers.map(u => `🎂 **${u.tag}**`).join('\n'),
                footer: {
                    text: 'Happy Birthday to everyone celebrating today!',
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
