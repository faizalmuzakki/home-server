import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { addThreadChannel, removeThreadChannel, getThreadChannels } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('autothread')
        .setDescription('Automatically create a thread for every new message in a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Enable auto-threading in a channel')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to auto-thread')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addIntegerOption(opt =>
                    opt.setName('archive')
                        .setDescription('Auto-archive after inactivity (minutes, default 1440 = 24 h)')
                        .setRequired(false)
                        .addChoices(
                            { name: '1 hour',  value: 60 },
                            { name: '24 hours', value: 1440 },
                            { name: '3 days',  value: 4320 },
                            { name: '1 week',  value: 10080 },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Disable auto-threading in a channel')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to stop auto-threading')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List channels with auto-threading enabled')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            const channel = interaction.options.getChannel('channel');
            const archive = interaction.options.getInteger('archive') || 1440;

            addThreadChannel(interaction.guildId, channel.id, archive);

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '🧵 Auto-Thread Enabled',
                    description: `Every new message in ${channel} will automatically get its own thread.`,
                    fields: [
                        { name: 'Archive after', value: `${archive >= 1440 ? `${archive / 60 / 24}d` : `${archive / 60}h`} of inactivity`, inline: true },
                    ],
                }],
            });

        } else if (sub === 'remove') {
            const channel = interaction.options.getChannel('channel');
            const result = removeThreadChannel(interaction.guildId, channel.id);

            if (result.changes === 0) {
                return interaction.reply({
                    content: `${channel} was not in the auto-thread list.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                embeds: [{
                    color: 0xED4245,
                    title: '🧵 Auto-Thread Disabled',
                    description: `New messages in ${channel} will no longer get automatic threads.`,
                }],
            });

        } else if (sub === 'list') {
            const channels = getThreadChannels(interaction.guildId);

            if (channels.length === 0) {
                return interaction.reply({
                    content: 'No channels have auto-threading enabled. Use `/autothread add` to set one up.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const lines = channels.map(c => {
                const archiveLabel = c.archive_duration >= 1440
                    ? `${c.archive_duration / 60 / 24}d`
                    : `${c.archive_duration / 60}h`;
                return `<#${c.channel_id}> — archive after ${archiveLabel}`;
            }).join('\n');

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '🧵 Auto-Thread Channels',
                    description: lines,
                }],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
