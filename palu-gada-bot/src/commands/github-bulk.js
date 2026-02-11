import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { addGithubWebhook, getGithubWebhooks } from '../database/models.js';
import { logCommandError } from '../utils/errorLogger.js';
import crypto from 'crypto';

export default {
    data: new SlashCommandBuilder()
        .setName('github-bulk')
        .setDescription('Bulk setup GitHub webhooks using GitHub API')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup webhooks for all repos in an organization')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send notifications')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addStringOption(option =>
                    option
                        .setName('token')
                        .setDescription('GitHub Personal Access Token (with admin:repo_hook scope)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('organization')
                        .setDescription('GitHub organization name')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup-user')
                .setDescription('Setup webhooks for all your personal repos')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send notifications')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addStringOption(option =>
                    option
                        .setName('token')
                        .setDescription('GitHub Personal Access Token (with admin:repo_hook scope)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('filter-org')
                        .setDescription('Only setup webhooks for repos in this organization (optional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('verify')
                .setDescription('Check which repos have webhooks configured')
                .addStringOption(option =>
                    option
                        .setName('token')
                        .setDescription('GitHub Personal Access Token (with admin:repo_hook scope)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('organization')
                        .setDescription('GitHub organization name (optional, checks all your repos if not specified)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Bulk remove webhooks from repos')
                .addStringOption(option =>
                    option
                        .setName('token')
                        .setDescription('GitHub Personal Access Token (with admin:repo_hook scope)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('organization')
                        .setDescription('GitHub organization name (optional, removes from all your repos if not specified)')
                        .setRequired(false)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Defer reply since this might take a while
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (subcommand === 'verify') {
            return this.handleVerify(interaction);
        }

        if (subcommand === 'remove') {
            return this.handleRemove(interaction);
        }

        const channel = interaction.options.getChannel('channel');
        const token = interaction.options.getString('token');

        // Check bot permissions
        const permissions = channel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
            return interaction.editReply({
                content: `I need Send Messages and Embed Links permissions in ${channel}.`,
            });
        }

        // Generate webhook secret
        const webhookSecret = crypto.randomBytes(32).toString('hex');
        const webhookUrl = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/github/webhook`;

        const events = ['push', 'pull_request', 'issues', 'release', 'create', 'delete'];

        try {
            let repos = [];
            let organization = null;

            if (subcommand === 'setup') {
                organization = interaction.options.getString('organization');
                
                // Fetch all repos in organization
                const response = await fetch(`https://api.github.com/orgs/${organization}/repos?per_page=100`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Discord-Bot',
                    },
                });

                if (!response.ok) {
                    const error = await response.json();
                    return interaction.editReply({
                        content: `Failed to fetch organization repos: ${error.message || response.statusText}\n\nMake sure:\n1. The organization name is correct\n2. Your token has \`read:org\` and \`admin:repo_hook\` scopes\n3. You have access to the organization`,
                    });
                }

                repos = await response.json();
            } else {
                // Fetch user's repos - get all pages
                let page = 1;
                let allRepos = [];
                const filterOrg = interaction.options.getString('filter-org');
                
                while (true) {
                    const response = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&type=all`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Discord-Bot',
                        },
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        return interaction.editReply({
                            content: `Failed to fetch your repos: ${error.message || response.statusText}\n\nMake sure your token has \`repo\` and \`admin:repo_hook\` scopes.\n\nToken scopes needed:\n- \`repo\` (Full control of private repositories)\n- \`admin:repo_hook\` (Full control of repository hooks)`,
                        });
                    }

                    const pageRepos = await response.json();
                    if (pageRepos.length === 0) break;
                    
                    allRepos = allRepos.concat(pageRepos);
                    
                    // If we got less than 100, we're on the last page
                    if (pageRepos.length < 100) break;
                    page++;
                }

                // Filter by organization if specified
                if (filterOrg) {
                    repos = allRepos.filter(repo => repo.owner.login === filterOrg);
                    organization = filterOrg;
                } else {
                    repos = allRepos;
                }
            }

            if (repos.length === 0) {
                return interaction.editReply({
                    content: 'No repositories found.',
                });
            }

            // Create webhooks for each repo
            const results = {
                success: [],
                failed: [],
                skipped: [],
            };

            for (const repo of repos) {
                try {
                    // Check if webhook already exists
                    const existingWebhooks = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Discord-Bot',
                        },
                    });

                    if (existingWebhooks.ok) {
                        const hooks = await existingWebhooks.json();
                        const alreadyExists = hooks.some(hook => hook.config?.url === webhookUrl);
                        
                        if (alreadyExists) {
                            results.skipped.push(repo.name);
                            continue;
                        }
                    }

                    // Create webhook
                    const response = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'Discord-Bot',
                        },
                        body: JSON.stringify({
                            name: 'web',
                            active: true,
                            events: ['*'], // All events
                            config: {
                                url: webhookUrl,
                                content_type: 'json',
                                secret: webhookSecret,
                                insecure_ssl: '0',
                            },
                        }),
                    });

                    if (response.ok) {
                        results.success.push(repo.name);
                    } else {
                        const error = await response.json();
                        results.failed.push(`${repo.name}: ${error.message}`);
                    }
                } catch (error) {
                    results.failed.push(`${repo.name}: ${error.message}`);
                }
            }

            // Save to database
            const result = addGithubWebhook(
                interaction.guildId,
                channel.id,
                organization,
                null, // No specific repo filter
                events,
                webhookSecret
            );

            // Build response
            const embed = {
                color: results.success.length > 0 ? 0x57F287 : 0xFEE75C,
                title: '🔗 Bulk GitHub Webhook Setup',
                fields: [],
                footer: {
                    text: `Webhook ID: ${result.lastInsertRowid}`,
                },
                timestamp: new Date().toISOString(),
            };

            if (results.success.length > 0) {
                embed.fields.push({
                    name: `✅ Success (${results.success.length})`,
                    value: results.success.slice(0, 10).join(', ') + (results.success.length > 10 ? `\n...and ${results.success.length - 10} more` : ''),
                    inline: false,
                });
            }

            if (results.skipped.length > 0) {
                embed.fields.push({
                    name: `⏭️ Skipped (${results.skipped.length})`,
                    value: `Already have webhooks: ${results.skipped.slice(0, 5).join(', ')}${results.skipped.length > 5 ? '...' : ''}`,
                    inline: false,
                });
            }

            if (results.failed.length > 0) {
                embed.fields.push({
                    name: `❌ Failed (${results.failed.length})`,
                    value: results.failed.slice(0, 3).join('\n').slice(0, 1024),
                    inline: false,
                });
            }

            embed.description = `Notifications will be sent to ${channel}\n\n**Total repos:** ${repos.length}\n**Webhooks created:** ${results.success.length}`;

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[ERROR] Bulk GitHub webhook setup failed:', error);
            await logCommandError(interaction, error, 'github-bulk');
            await interaction.editReply({
                content: `Failed to setup webhooks: ${error.message}`,
            });
        }
    },

    async handleVerify(interaction) {
        const token = interaction.options.getString('token');
        const organization = interaction.options.getString('organization');
        const webhookUrl = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/github/webhook`;

        try {
            let repos = [];

            if (organization) {
                // Fetch organization repos
                const response = await fetch(`https://api.github.com/orgs/${organization}/repos?per_page=100`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Discord-Bot',
                    },
                });

                if (!response.ok) {
                    const error = await response.json();
                    return interaction.editReply({
                        content: `Failed to fetch organization repos: ${error.message || response.statusText}`,
                    });
                }

                repos = await response.json();
            } else {
                // Fetch all user repos
                let page = 1;
                let allRepos = [];
                
                while (true) {
                    const response = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&type=all`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Discord-Bot',
                        },
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        return interaction.editReply({
                            content: `Failed to fetch your repos: ${error.message || response.statusText}`,
                        });
                    }

                    const pageRepos = await response.json();
                    if (pageRepos.length === 0) break;
                    
                    allRepos = allRepos.concat(pageRepos);
                    
                    if (pageRepos.length < 100) break;
                    page++;
                }

                repos = allRepos;
            }

            if (repos.length === 0) {
                return interaction.editReply({
                    content: 'No repositories found.',
                });
            }

            // Check webhooks for each repo
            const results = {
                withWebhook: [],
                withoutWebhook: [],
                errors: [],
            };

            for (const repo of repos) {
                try {
                    const response = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Discord-Bot',
                        },
                    });

                    if (response.ok) {
                        const hooks = await response.json();
                        const hasOurWebhook = hooks.some(hook => hook.config?.url === webhookUrl);
                        
                        if (hasOurWebhook) {
                            results.withWebhook.push(repo.name);
                        } else {
                            results.withoutWebhook.push(repo.name);
                        }
                    } else {
                        const error = await response.json();
                        results.errors.push(`${repo.name}: ${error.message}`);
                    }
                } catch (error) {
                    results.errors.push(`${repo.name}: ${error.message}`);
                }
            }

            // Build response
            const embed = {
                color: 0x5865F2,
                title: '🔍 GitHub Webhook Verification',
                description: `Checked ${repos.length} repositories${organization ? ` in **${organization}**` : ''}`,
                fields: [],
                timestamp: new Date().toISOString(),
            };

            if (results.withWebhook.length > 0) {
                const list = results.withWebhook.slice(0, 20).join(', ');
                const more = results.withWebhook.length > 20 ? `\n...and ${results.withWebhook.length - 20} more` : '';
                embed.fields.push({
                    name: `✅ With Webhook (${results.withWebhook.length})`,
                    value: list + more,
                    inline: false,
                });
            }

            if (results.withoutWebhook.length > 0) {
                const list = results.withoutWebhook.slice(0, 20).join(', ');
                const more = results.withoutWebhook.length > 20 ? `\n...and ${results.withoutWebhook.length - 20} more` : '';
                embed.fields.push({
                    name: `❌ Without Webhook (${results.withoutWebhook.length})`,
                    value: list + more,
                    inline: false,
                });
            }

            if (results.errors.length > 0) {
                embed.fields.push({
                    name: `⚠️ Errors (${results.errors.length})`,
                    value: results.errors.slice(0, 3).join('\n').slice(0, 1024),
                    inline: false,
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[ERROR] Webhook verification failed:', error);
            await interaction.editReply({
                content: `Failed to verify webhooks: ${error.message}`,
            });
        }
    },

    async handleRemove(interaction) {
        const token = interaction.options.getString('token');
        const organization = interaction.options.getString('organization');
        const webhookUrl = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/github/webhook`;

        try {
            let repos = [];

            if (organization) {
                // Fetch organization repos
                const response = await fetch(`https://api.github.com/orgs/${organization}/repos?per_page=100`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Discord-Bot',
                    },
                });

                if (!response.ok) {
                    const error = await response.json();
                    return interaction.editReply({
                        content: `Failed to fetch organization repos: ${error.message || response.statusText}`,
                    });
                }

                repos = await response.json();
            } else {
                // Fetch all user repos
                let page = 1;
                let allRepos = [];
                
                while (true) {
                    const response = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&type=all`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Discord-Bot',
                        },
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        return interaction.editReply({
                            content: `Failed to fetch your repos: ${error.message || response.statusText}`,
                        });
                    }

                    const pageRepos = await response.json();
                    if (pageRepos.length === 0) break;
                    
                    allRepos = allRepos.concat(pageRepos);
                    
                    if (pageRepos.length < 100) break;
                    page++;
                }

                repos = allRepos;
            }

            if (repos.length === 0) {
                return interaction.editReply({
                    content: 'No repositories found.',
                });
            }

            // Remove webhooks from each repo
            const results = {
                removed: [],
                notFound: [],
                errors: [],
            };

            for (const repo of repos) {
                try {
                    // Get all hooks for the repo
                    const response = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Discord-Bot',
                        },
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        results.errors.push(`${repo.name}: ${error.message}`);
                        continue;
                    }

                    const hooks = await response.json();
                    const ourHook = hooks.find(hook => hook.config?.url === webhookUrl);
                    
                    if (!ourHook) {
                        results.notFound.push(repo.name);
                        continue;
                    }

                    // Delete the webhook
                    const deleteResponse = await fetch(`https://api.github.com/repos/${repo.full_name}/hooks/${ourHook.id}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Discord-Bot',
                        },
                    });

                    if (deleteResponse.ok || deleteResponse.status === 204) {
                        results.removed.push(repo.name);
                    } else {
                        const error = await deleteResponse.json();
                        results.errors.push(`${repo.name}: ${error.message}`);
                    }
                } catch (error) {
                    results.errors.push(`${repo.name}: ${error.message}`);
                }
            }

            // Build response
            const embed = {
                color: results.removed.length > 0 ? 0x57F287 : 0xFEE75C,
                title: '🗑️ Bulk GitHub Webhook Removal',
                description: `Processed ${repos.length} repositories${organization ? ` in **${organization}**` : ''}`,
                fields: [],
                timestamp: new Date().toISOString(),
            };

            if (results.removed.length > 0) {
                const list = results.removed.slice(0, 20).join(', ');
                const more = results.removed.length > 20 ? `\n...and ${results.removed.length - 20} more` : '';
                embed.fields.push({
                    name: `✅ Removed (${results.removed.length})`,
                    value: list + more,
                    inline: false,
                });
            }

            if (results.notFound.length > 0) {
                const list = results.notFound.slice(0, 20).join(', ');
                const more = results.notFound.length > 20 ? `\n...and ${results.notFound.length - 20} more` : '';
                embed.fields.push({
                    name: `⏭️ No Webhook Found (${results.notFound.length})`,
                    value: list + more,
                    inline: false,
                });
            }

            if (results.errors.length > 0) {
                embed.fields.push({
                    name: `❌ Errors (${results.errors.length})`,
                    value: results.errors.slice(0, 3).join('\n').slice(0, 1024),
                    inline: false,
                });
            }

            if (results.removed.length === 0 && results.errors.length === 0) {
                embed.description += '\n\n✨ No webhooks found to remove!';
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[ERROR] Webhook removal failed:', error);
            await interaction.editReply({
                content: `Failed to remove webhooks: ${error.message}`,
            });
        }
    },
};
