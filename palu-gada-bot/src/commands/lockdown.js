import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('Lock or unlock a channel')
        .addSubcommand(subcommand =>
            subcommand
                .setName('lock')
                .setDescription('Lock a channel (prevent @everyone from sending messages)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to lock (defaults to current)')
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for locking')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unlock')
                .setDescription('Unlock a channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to unlock (defaults to current)')
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('Lock/unlock all channels in the server')
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Lock or unlock')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Lock All Channels', value: 'lock' },
                            { name: 'Unlock All Channels', value: 'unlock' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for lockdown')
                        .setRequired(false)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'lock') {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'Channel locked by moderator';

            await lockChannel(interaction, channel, reason);

        } else if (subcommand === 'unlock') {
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            await unlockChannel(interaction, channel);

        } else if (subcommand === 'server') {
            const action = interaction.options.getString('action');
            const reason = interaction.options.getString('reason') || `Server ${action}ed by moderator`;

            await interaction.deferReply();

            const textChannels = interaction.guild.channels.cache.filter(
                c => c.type === ChannelType.GuildText && c.permissionsFor(interaction.guild.members.me).has('ManageChannels')
            );

            let success = 0;
            let failed = 0;

            for (const [, channel] of textChannels) {
                try {
                    if (action === 'lock') {
                        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                            SendMessages: false,
                        }, { reason: `${reason} | By ${interaction.user.tag}` });
                    } else {
                        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                            SendMessages: null, // Reset to default
                        }, { reason: `Server unlocked | By ${interaction.user.tag}` });
                    }
                    success++;
                } catch {
                    failed++;
                }
            }

            const embed = {
                color: action === 'lock' ? 0xED4245 : 0x57F287,
                title: action === 'lock' ? '🔒 Server Lockdown' : '🔓 Server Unlocked',
                description: action === 'lock'
                    ? 'All text channels have been locked.'
                    : 'All text channels have been unlocked.',
                fields: [
                    {
                        name: 'Channels Affected',
                        value: `${success} success, ${failed} failed`,
                        inline: true,
                    },
                ],
                footer: {
                    text: `By ${interaction.user.tag}`,
                },
                timestamp: new Date().toISOString(),
            };

            if (reason !== `Server ${action}ed by moderator`) {
                embed.fields.push({
                    name: 'Reason',
                    value: reason,
                    inline: false,
                });
            }

            await interaction.editReply({ embeds: [embed] });
        }
    },
};

async function lockChannel(interaction, channel, reason) {
    // Check permissions
    const permissions = channel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has('ManageChannels')) {
        return interaction.reply({
            content: `I don't have permission to manage ${channel}.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        // Save current permissions for @everyone
        const currentOverwrite = channel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
        const wasSendMessages = currentOverwrite?.allow.has('SendMessages');

        // Lock the channel
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: false,
        }, { reason: `${reason} | By ${interaction.user.tag}` });

        const embed = {
            color: 0xED4245,
            title: '🔒 Channel Locked',
            description: `${channel} has been locked. Only users with specific permissions can send messages.`,
            fields: [],
            footer: {
                text: `By ${interaction.user.tag}`,
            },
            timestamp: new Date().toISOString(),
        };

        if (reason !== 'Channel locked by moderator') {
            embed.fields.push({
                name: 'Reason',
                value: reason,
                inline: false,
            });
        }

        await interaction.reply({ embeds: [embed] });

        // Send a message in the locked channel
        try {
            await channel.send({
                embeds: [{
                    color: 0xED4245,
                    title: '🔒 This channel has been locked',
                    description: reason,
                    footer: {
                        text: `Locked by ${interaction.user.tag}`,
                    },
                    timestamp: new Date().toISOString(),
                }],
            });
        } catch {
            // Couldn't send message to channel
        }

    } catch (error) {
        await logCommandError(interaction, error, 'lockdown');
        await interaction.reply({
            content: 'Failed to lock the channel. Please check my permissions.',
            flags: MessageFlags.Ephemeral,
        });
    }
}

async function unlockChannel(interaction, channel) {
    // Check permissions
    const permissions = channel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has('ManageChannels')) {
        return interaction.reply({
            content: `I don't have permission to manage ${channel}.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        // Reset SendMessages permission for @everyone
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: null, // Reset to default (inherit from category/server)
        }, { reason: `Channel unlocked | By ${interaction.user.tag}` });

        const embed = {
            color: 0x57F287,
            title: '🔓 Channel Unlocked',
            description: `${channel} has been unlocked.`,
            footer: {
                text: `By ${interaction.user.tag}`,
            },
            timestamp: new Date().toISOString(),
        };

        await interaction.reply({ embeds: [embed] });

        // Send a message in the unlocked channel
        try {
            await channel.send({
                embeds: [{
                    color: 0x57F287,
                    title: '🔓 This channel has been unlocked',
                    description: 'You can now send messages again.',
                    footer: {
                        text: `Unlocked by ${interaction.user.tag}`,
                    },
                    timestamp: new Date().toISOString(),
                }],
            });
        } catch {
            // Couldn't send message to channel
        }

    } catch (error) {
        await logCommandError(interaction, error, 'lockdown');
        await interaction.reply({
            content: 'Failed to unlock the channel. Please check my permissions.',
            flags: MessageFlags.Ephemeral,
        });
    }
}
