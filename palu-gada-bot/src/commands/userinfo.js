import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get information about a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to get information about (defaults to yourself)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;

        await interaction.deferReply();

        // Fetch fresh user data
        const fetchedUser = await interaction.client.users.fetch(user.id, { force: true });

        const embed = {
            color: fetchedUser.accentColor || 0x5865F2,
            title: `${fetchedUser.tag}`,
            thumbnail: {
                url: fetchedUser.displayAvatarURL({ dynamic: true, size: 256 }),
            },
            fields: [
                {
                    name: 'User ID',
                    value: fetchedUser.id,
                    inline: true,
                },
                {
                    name: 'Account Created',
                    value: `<t:${Math.floor(fetchedUser.createdTimestamp / 1000)}:R>`,
                    inline: true,
                },
                {
                    name: 'Bot',
                    value: fetchedUser.bot ? 'Yes' : 'No',
                    inline: true,
                },
            ],
            footer: {
                text: `Requested by ${interaction.user.tag}`,
            },
            timestamp: new Date().toISOString(),
        };

        // Add badges if any
        const flags = fetchedUser.flags?.toArray() || [];
        if (flags.length > 0) {
            const badgeEmojis = {
                'Staff': '👨‍💼',
                'Partner': '🤝',
                'Hypesquad': '🏠',
                'BugHunterLevel1': '🐛',
                'BugHunterLevel2': '🐛',
                'HypeSquadOnlineHouse1': '🏠 Bravery',
                'HypeSquadOnlineHouse2': '🏠 Brilliance',
                'HypeSquadOnlineHouse3': '🏠 Balance',
                'PremiumEarlySupporter': '👑',
                'TeamPseudoUser': '👥',
                'VerifiedBot': '✅',
                'VerifiedDeveloper': '👨‍💻',
                'CertifiedModerator': '🛡️',
                'BotHTTPInteractions': '🌐',
                'ActiveDeveloper': '💻',
            };

            const badges = flags.map(flag => badgeEmojis[flag] || flag).join(' ');
            embed.fields.push({
                name: 'Badges',
                value: badges,
                inline: false,
            });
        }

        // Add member info if in a guild
        if (interaction.guild) {
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (member) {
                embed.fields.push({
                    name: 'Joined Server',
                    value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
                    inline: true,
                });

                // Nickname
                if (member.nickname) {
                    embed.fields.push({
                        name: 'Nickname',
                        value: member.nickname,
                        inline: true,
                    });
                }

                // Highest role
                const highestRole = member.roles.highest;
                if (highestRole.id !== interaction.guild.id) {
                    embed.fields.push({
                        name: 'Highest Role',
                        value: highestRole.toString(),
                        inline: true,
                    });
                    embed.color = highestRole.color || embed.color;
                }

                // Roles (excluding @everyone)
                const roles = member.roles.cache
                    .filter(r => r.id !== interaction.guild.id)
                    .sort((a, b) => b.position - a.position);

                if (roles.size > 0) {
                    const roleList = roles.first(10).map(r => r.toString()).join(', ');
                    embed.fields.push({
                        name: `Roles (${roles.size})`,
                        value: roleList + (roles.size > 10 ? `\n...and ${roles.size - 10} more` : ''),
                        inline: false,
                    });
                }

                // Permissions check
                const keyPermissions = [];
                if (member.permissions.has('Administrator')) keyPermissions.push('Administrator');
                else {
                    if (member.permissions.has('ManageGuild')) keyPermissions.push('Manage Server');
                    if (member.permissions.has('ManageRoles')) keyPermissions.push('Manage Roles');
                    if (member.permissions.has('ManageChannels')) keyPermissions.push('Manage Channels');
                    if (member.permissions.has('ManageMessages')) keyPermissions.push('Manage Messages');
                    if (member.permissions.has('KickMembers')) keyPermissions.push('Kick');
                    if (member.permissions.has('BanMembers')) keyPermissions.push('Ban');
                }

                if (keyPermissions.length > 0) {
                    embed.fields.push({
                        name: 'Key Permissions',
                        value: keyPermissions.join(', '),
                        inline: false,
                    });
                }

                // Status and activity
                if (member.presence) {
                    const statusEmoji = {
                        online: '🟢',
                        idle: '🟡',
                        dnd: '🔴',
                        offline: '⚫',
                    };

                    embed.fields.push({
                        name: 'Status',
                        value: `${statusEmoji[member.presence.status] || '⚫'} ${member.presence.status}`,
                        inline: true,
                    });

                    const activity = member.presence.activities[0];
                    if (activity) {
                        let activityText = activity.name;
                        if (activity.details) activityText += `\n${activity.details}`;
                        if (activity.state) activityText += `\n${activity.state}`;

                        embed.fields.push({
                            name: `Activity (${activity.type === 0 ? 'Playing' : activity.type === 1 ? 'Streaming' : activity.type === 2 ? 'Listening' : activity.type === 3 ? 'Watching' : activity.type === 4 ? 'Custom' : 'Activity'})`,
                            value: activityText.slice(0, 1024),
                            inline: true,
                        });
                    }
                }

                // Use member avatar if different from user avatar
                if (member.avatar) {
                    embed.thumbnail.url = member.displayAvatarURL({ dynamic: true, size: 256 });
                }
            }
        }

        // Add banner if user has one
        if (fetchedUser.banner) {
            embed.image = {
                url: fetchedUser.bannerURL({ size: 1024 }),
            };
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
