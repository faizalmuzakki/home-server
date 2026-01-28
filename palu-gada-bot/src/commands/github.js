import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { addGithubWebhook, getGithubWebhooks, deleteGithubWebhook, toggleGithubWebhook, getGithubWebhookById } from '../database/models.js';
import { logCommandError } from '../utils/errorLogger.js';
import crypto from 'crypto';

export default {
    data: new SlashCommandBuilder()
        .setName('github')
        .setDescription('Configure GitHub repository notifications')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add GitHub webhook notifications')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send notifications')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addStringOption(option =>
                    option
                        .setName('organization')
                        .setDescription('GitHub organization name (leave empty for all)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('repository')
                        .setDescription('Repository name (leave empty for all in org)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List configured GitHub webhooks')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a GitHub webhook')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('Webhook ID to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable a GitHub webhook')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('Webhook ID')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            const channel = interaction.options.getChannel('channel');
            const organization = interaction.options.getString('organization') || null;
            const repository = interaction.options.getString('repository') || null;

            // Check bot permissions
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                return interaction.reply({
                    content: `I need Send Messages and Embed Links permissions in ${channel}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Generate webhook secret
            const webhookSecret = crypto.randomBytes(32).toString('hex');

            // Default events
            const events = ['push', 'pull_request', 'issues', 'release', 'create', 'delete'];

            try {
                const result = addGithubWebhook(
                    interaction.guildId,
                    channel.id,
                    organization,
                    repository,
                    events,
                    webhookSecret
                );

                const webhookUrl = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/github/webhook`;

                const filterText = repository 
                    ? `Repository: \`${organization}/${repository}\``
                    : organization 
                        ? `Organization: \`${organization}\` (all repos)`
                        : 'All repositories';

                await interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ GitHub Webhook Added',
                        description: `GitHub notifications will be sent to ${channel}`,
                        fields: [
                            {
                                name: 'Webhook ID',
                                value: `${result.lastInsertRowid}`,
                                inline: true,
                            },
                            {
                                name: 'Filter',
                                value: filterText,
                                inline: true,
                            },
                            {
                                name: 'Events',
                                value: events.join(', '),
                                inline: false,
                            },
                            {
                                name: '📝 Setup Instructions',
                                value: `1. Go to your GitHub repository/organization settings\n2. Navigate to Webhooks → Add webhook\n3. Set Payload URL to:\n\`\`\`\n${webhookUrl}\`\`\`\n4. Set Content type to: \`application/json\`\n5. Set Secret to:\n\`\`\`\n${webhookSecret}\`\`\`\n6. Select events or choose "Send me everything"\n7. Click "Add webhook"`,
                                inline: false,
                            },
                        ],
                    }],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (error) {
                console.error('[ERROR] Failed to add GitHub webhook:', error);
                await logCommandError(interaction, error, 'github');
                await interaction.reply({
                    content: 'Failed to add GitHub webhook. Please try again.',
                    flags: MessageFlags.Ephemeral,
                });
            }

        } else if (subcommand === 'list') {
            const webhooks = getGithubWebhooks(interaction.guildId);

            if (webhooks.length === 0) {
                return interaction.reply({
                    content: 'No GitHub webhooks configured. Use `/github add` to set one up.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = {
                color: 0x5865F2,
                title: '🔗 GitHub Webhooks',
                description: webhooks.map(w => {
                    const channel = interaction.guild.channels.cache.get(w.channel_id);
                    const filterText = w.repository 
                        ? `\`${w.organization}/${w.repository}\``
                        : w.organization 
                            ? `\`${w.organization}\` (all repos)`
                            : 'All repositories';
                    const status = w.enabled ? '✅ Enabled' : '❌ Disabled';
                    
                    return `**ID ${w.id}** - ${status}\nChannel: ${channel || '⚠️ Deleted'}\nFilter: ${filterText}`;
                }).join('\n\n'),
                footer: {
                    text: `${webhooks.length} webhook${webhooks.length !== 1 ? 's' : ''} configured`,
                },
            };

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'remove') {
            const id = interaction.options.getInteger('id');

            const result = deleteGithubWebhook(id, interaction.guildId);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Webhook not found or you don\'t have permission to remove it.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `✅ GitHub webhook #${id} has been removed.`,
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === 'toggle') {
            const id = interaction.options.getInteger('id');
            const enabled = interaction.options.getBoolean('enabled');

            const result = toggleGithubWebhook(id, interaction.guildId, enabled);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Webhook not found or you don\'t have permission to modify it.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `✅ GitHub webhook #${id} has been ${enabled ? 'enabled' : 'disabled'}.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
