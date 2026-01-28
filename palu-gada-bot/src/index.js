import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import config, { validateConfig, checkGuildAccess, isOwner } from './config.js';
import { executeCommand, formatOutput, isShellAllowed } from './utils/shellExecutor.js';
import {
    addAllowedGuild,
    isCommandEnabled,
    getGuildSettings,
    addXp,
    getStarboardMessage,
    addStarboardMessage,
    getActiveGiveaways,
    getGiveaway,
    getGiveawayEntries,
    endGiveaway,
    getPendingReminders,
    markReminderCompleted,
    getAfk,
    removeAfk,
    addAuditLog,
    getReactionRole,
} from './database/models.js';
import { startApiServer, setDiscordClient } from './api/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate configuration
validateConfig();

// Seed allowed guilds from environment variable (if any)
if (config.allowedGuildsEnv.length > 0) {
    console.log(`[INFO] Seeding ${config.allowedGuildsEnv.length} allowed guild(s) from environment`);
    for (const guildId of config.allowedGuildsEnv) {
        addAllowedGuild(guildId.trim(), 'env', 'Seeded from ALLOWED_GUILDS env var');
    }
}

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

// Collection to store commands
client.commands = new Collection();

// Load commands
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(`file://${filePath}`);

    if ('data' in command.default && 'execute' in command.default) {
        client.commands.set(command.default.data.name, command.default);
        console.log(`[INFO] Loaded command: ${command.default.data.name}`);
    } else {
        console.log(`[WARNING] Command at ${filePath} is missing "data" or "execute" property.`);
    }
}

// Handle ready event
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[INFO] Bot is ready! Logged in as ${readyClient.user.tag}`);
    console.log(`[INFO] Serving ${readyClient.guilds.cache.size} guild(s)`);

    // Start API server if enabled
    if (config.apiEnabled) {
        setDiscordClient(client);
        await startApiServer(config.apiPort);
    }

    // Start reminder checker (runs every 30 seconds)
    setInterval(async () => {
        try {
            const reminders = getPendingReminders();

            for (const reminder of reminders) {
                try {
                    // Try to send DM first
                    const user = await client.users.fetch(reminder.user_id).catch(() => null);

                    if (user) {
                        const embed = {
                            color: 0x5865F2,
                            title: '⏰ Reminder!',
                            description: reminder.message,
                            footer: {
                                text: `Set ${formatTimeAgo(new Date(reminder.created_at))}`,
                            },
                            timestamp: new Date().toISOString(),
                        };

                        // Try DM first
                        let sent = false;
                        try {
                            await user.send({ embeds: [embed] });
                            sent = true;
                        } catch (e) {
                            // DMs disabled, try channel
                        }

                        // If DM failed and we have a channel, try there
                        if (!sent && reminder.channel_id) {
                            const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
                            if (channel) {
                                await channel.send({
                                    content: `<@${reminder.user_id}>`,
                                    embeds: [embed],
                                });
                            }
                        }
                    }

                    // Mark reminder as completed
                    markReminderCompleted(reminder.id);
                } catch (e) {
                    console.error(`[ERROR] Failed to send reminder ${reminder.id}:`, e);
                }
            }
        } catch (e) {
            console.error('[ERROR] Reminder checker error:', e);
        }
    }, 30000);

    console.log('[INFO] Reminder checker started');

    // Start giveaway check interval (every 30 seconds)
    setInterval(() => checkEndedGiveaways(client), 30000);
    console.log('[INFO] Giveaway checker started');
});

// Helper function to format time ago
function formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    return 'just now';
}

// Helper function to format duration
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 && parts.length < 2) parts.push(`${seconds % 60}s`);

    return parts.join(' ') || 'less than a second';
}

// Check for ended giveaways
async function checkEndedGiveaways(client) {
    const guilds = client.guilds.cache;

    for (const [guildId] of guilds) {
        const giveaways = getActiveGiveaways(guildId);

        for (const giveaway of giveaways) {
            const endsAt = new Date(giveaway.ends_at);

            if (endsAt <= new Date()) {
                // Giveaway has ended
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
                        // Pick winners using Fisher-Yates shuffle for fair selection
                        const winners = [];
                        const shuffled = [...entries];
                        // Fisher-Yates shuffle for uniform randomness
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
                                // User not found
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
                    console.error('[ERROR] Failed to end giveaway:', error);
                }
            }
        }
    }
}

// Handle button interactions (giveaways)
client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId === 'giveaway_enter') {
            const giveawayCommand = client.commands.get('giveaway');
            if (giveawayCommand && giveawayCommand.handleButton) {
                try {
                    await giveawayCommand.handleButton(interaction);
                } catch (error) {
                    console.error('[ERROR] Giveaway button error:', error);
                }
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    // Check guild access
    if (interaction.guildId && !checkGuildAccess(interaction.guildId)) {
        return interaction.reply({
            content: 'This bot is not authorized to operate in this server.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`[ERROR] No command matching ${interaction.commandName} was found.`);
        return;
    }

    // Check if command is enabled for this guild
    if (interaction.guildId && !isCommandEnabled(interaction.guildId, interaction.commandName)) {
        return interaction.reply({
            content: `The \`/${interaction.commandName}\` command is disabled in this server.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`[ERROR] Error executing command ${interaction.commandName}:`, error);

        // Log error to guild's log channel if configured
        if (interaction.guildId) {
            try {
                const settings = getGuildSettings(interaction.guildId);
                if (settings?.log_enabled && settings?.log_channel_id) {
                    const logChannel = await client.channels.fetch(settings.log_channel_id).catch(() => null);
                    if (logChannel) {
                        await logChannel.send({
                            embeds: [{
                                color: 0xED4245, // Red for errors
                                title: '⚠️ Command Error',
                                fields: [
                                    {
                                        name: 'Command',
                                        value: `\`/${interaction.commandName}\``,
                                        inline: true,
                                    },
                                    {
                                        name: 'User',
                                        value: `${interaction.user.tag} (${interaction.user.id})`,
                                        inline: true,
                                    },
                                    {
                                        name: 'Channel',
                                        value: `<#${interaction.channelId}>`,
                                        inline: true,
                                    },
                                    {
                                        name: 'Error',
                                        value: `\`\`\`${error.message?.slice(0, 1000) || 'Unknown error'}\`\`\``,
                                        inline: false,
                                    },
                                ],
                                timestamp: new Date().toISOString(),
                            }],
                        }).catch(() => { });

                        // Also add to audit log database
                        addAuditLog(
                            interaction.guildId,
                            'COMMAND_ERROR',
                            interaction.user.id,
                            null,
                            `Command /${interaction.commandName} failed: ${error.message?.slice(0, 500)}`
                        );
                    }
                }
            } catch (logError) {
                console.error('[ERROR] Failed to log error to guild channel:', logError);
            }
        }

        const errorMessage = {
            content: 'There was an error executing this command!',
            flags: MessageFlags.Ephemeral,
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch {
            // Couldn't respond to interaction
        }
    }
});

// Handle new member joining (welcomer + autorole)
client.on(Events.GuildMemberAdd, async (member) => {
    if (!checkGuildAccess(member.guild.id)) return;

    const settings = getGuildSettings(member.guild.id);

    // Welcome message
    if (settings.welcome_enabled && settings.welcome_channel_id) {
        const channel = member.guild.channels.cache.get(settings.welcome_channel_id);
        if (channel) {
            const message = (settings.welcome_message || 'Welcome {user} to {server}!')
                .replace(/{user}/g, `${member}`)
                .replace(/{username}/g, member.user.username)
                .replace(/{server}/g, member.guild.name)
                .replace(/{membercount}/g, member.guild.memberCount.toString());

            try {
                await channel.send({
                    embeds: [{
                        color: 0x57F287,
                        title: '👋 Welcome!',
                        description: message,
                        thumbnail: { url: member.user.displayAvatarURL({ dynamic: true, size: 256 }) },
                        footer: { text: `Member #${member.guild.memberCount}` },
                        timestamp: new Date().toISOString(),
                    }],
                });
            } catch (error) {
                console.error('[ERROR] Failed to send welcome message:', error);
            }
        }
    }

    // Auto role
    if (settings.autorole_enabled && settings.autorole_id) {
        const role = member.guild.roles.cache.get(settings.autorole_id);
        if (role) {
            try {
                await member.roles.add(role);
            } catch (error) {
                console.error('[ERROR] Failed to add autorole:', error);
            }
        }
    }
});

// Handle message for XP/leveling and AFK
const xpCooldowns = new Map();
client.on(Events.MessageCreate, async (message) => {
    // Ignore bots
    if (message.author.bot) return;

    // Shell channel handler - execute messages as shell commands
    if (config.shellChannelId && message.channel.id === config.shellChannelId) {
        if (!isShellAllowed(message.author.id)) {
            await message.reply({
                content: 'You are not authorized to use the shell channel.',
            }).catch(() => {});
            return;
        }

        const command = message.content.trim();
        if (!command) return;

        // React to show command is running
        await message.react('\u23F3').catch(() => {}); // hourglass

        try {
            const result = await executeCommand(command);
            const messages = formatOutput(result);

            // Remove hourglass, add result indicator
            await message.reactions.removeAll().catch(() => {});
            await message.react(result.exitCode === 0 ? '\u2705' : '\u274C').catch(() => {}); // green check or red x

            // Send output
            for (let i = 0; i < Math.min(messages.length, 10); i++) {
                await message.channel.send(messages[i]);
            }

            if (messages.length > 10) {
                await message.channel.send(`*Output truncated (${messages.length - 10} more chunks)*`);
            }
        } catch (error) {
            await message.reactions.removeAll().catch(() => {});
            await message.react('\u274C').catch(() => {});
            await message.reply({
                content: `\`\`\`\nError: ${error.message}\n\`\`\``,
            }).catch(() => {});
        }

        return; // Don't process shell channel messages for XP/AFK
    }

    // Handle AFK - check if author is returning from AFK
    const authorAfk = getAfk(message.author.id);
    if (authorAfk) {
        // User is back, remove AFK status
        removeAfk(message.author.id);

        const since = new Date(authorAfk.since);
        const duration = formatDuration(Date.now() - since.getTime());

        try {
            await message.reply({
                content: `👋 Welcome back, ${message.author}! Your AFK status has been removed.\nYou were AFK for **${duration}**.`,
                allowedMentions: { repliedUser: false },
            });
        } catch (e) {
            // Might not have permission to send
        }
    }

    // Check if any mentioned users are AFK
    if (message.mentions.users.size > 0) {
        const afkMessages = [];

        for (const [userId, user] of message.mentions.users) {
            if (user.bot) continue;

            const afkStatus = getAfk(userId);
            if (afkStatus) {
                const since = new Date(afkStatus.since);
                const duration = formatDuration(Date.now() - since.getTime());
                afkMessages.push(`💤 **${user.tag}** is AFK: ${afkStatus.message}\n*AFK for ${duration}*`);
            }
        }

        if (afkMessages.length > 0) {
            try {
                await message.reply({
                    content: afkMessages.join('\n\n'),
                    allowedMentions: { repliedUser: false },
                });
            } catch (e) {
                // Might not have permission to send
            }
        }
    }

    // XP/Leveling - only for guild messages
    if (!message.guild) return;
    if (!checkGuildAccess(message.guild.id)) return;

    // XP cooldown (1 minute per user per guild)
    const key = `${message.guild.id}-${message.author.id}`;
    const now = Date.now();
    const cooldownEnd = xpCooldowns.get(key);

    if (cooldownEnd && now < cooldownEnd) return;

    // Grant XP (15-25 per message)
    const xpGained = Math.floor(Math.random() * 11) + 15;
    const result = addXp(message.guild.id, message.author.id, xpGained);

    // Set cooldown
    xpCooldowns.set(key, now + 60000);

    // Check for level up
    if (result && result.leveledUp) {
        // Get guild settings to check for level channel
        const settings = getGuildSettings(message.guild.id);

        // Check if level notifications are enabled (default: enabled if not set)
        const levelEnabled = settings?.level_enabled !== 0;
        
        if (levelEnabled) {
            // Determine where to send the level-up message
            let targetChannel = message.channel; // Default: same channel

            if (settings?.level_channel_id) {
                // Use configured level channel if set
                const levelChannel = message.guild.channels.cache.get(settings.level_channel_id);
                if (levelChannel) {
                    targetChannel = levelChannel;
                }
            }

            // Send level up message
            try {
                await targetChannel.send({
                    content: `🎉 Congratulations ${message.author}! You've reached **Level ${result.newLevel}**!`,
                });
            } catch {
                // Couldn't send level up message
            }
        }
    }
});

// Handle message edits (like Dyno's message edit logging)
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    // Ignore bots
    if (newMessage.author?.bot) return;

    // Ignore DMs
    if (!newMessage.guild) return;

    // Check guild access
    if (!checkGuildAccess(newMessage.guild.id)) return;

    // Fetch partial messages if needed
    if (oldMessage.partial) {
        try {
            await oldMessage.fetch();
        } catch {
            return; // Can't fetch old message
        }
    }

    if (newMessage.partial) {
        try {
            await newMessage.fetch();
        } catch {
            return;
        }
    }

    // Ignore if content didn't change (could be embed update, pin, etc.)
    if (oldMessage.content === newMessage.content) return;

    // Check if message edit logging is enabled
    const settings = getGuildSettings(newMessage.guild.id);
    if (!settings?.log_enabled || !settings?.message_edit_log_enabled || !settings?.log_channel_id) return;

    const logChannel = newMessage.guild.channels.cache.get(settings.log_channel_id);
    if (!logChannel) return;

    // Truncate content if too long
    const maxLength = 1024;
    const oldContent = oldMessage.content?.length > maxLength
        ? oldMessage.content.slice(0, maxLength - 3) + '...'
        : (oldMessage.content || '*No content*');
    const newContent = newMessage.content?.length > maxLength
        ? newMessage.content.slice(0, maxLength - 3) + '...'
        : (newMessage.content || '*No content*');

    try {
        await logChannel.send({
            embeds: [{
                color: 0x5865F2, // Blurple color like Dyno
                author: {
                    name: newMessage.author.tag,
                    icon_url: newMessage.author.displayAvatarURL({ dynamic: true }),
                },
                title: `Message Edited in #${newMessage.channel.name}`,
                url: newMessage.url,
                fields: [
                    {
                        name: 'Before',
                        value: oldContent,
                        inline: false,
                    },
                    {
                        name: 'After',
                        value: newContent,
                        inline: false,
                    },
                ],
                footer: {
                    text: `User ID: ${newMessage.author.id}`,
                },
                timestamp: new Date().toISOString(),
            }],
        });

        // Add to audit log
        addAuditLog(
            newMessage.guild.id,
            'MESSAGE_EDIT',
            newMessage.author.id,
            null,
            `Edited message in #${newMessage.channel.name}`
        );
    } catch (error) {
        console.error('[ERROR] Failed to log message edit:', error);
    }
});

// Handle message deletes (like Dyno's message delete logging)
client.on(Events.MessageDelete, async (message) => {
    // Ignore bots
    if (message.author?.bot) return;

    // Ignore DMs
    if (!message.guild) return;

    // Check guild access
    if (!checkGuildAccess(message.guild.id)) return;

    // Check if message delete logging is enabled
    const settings = getGuildSettings(message.guild.id);
    if (!settings?.log_enabled || !settings?.message_delete_log_enabled || !settings?.log_channel_id) return;

    const logChannel = message.guild.channels.cache.get(settings.log_channel_id);
    if (!logChannel) return;

    // Don't log if we don't have the message content (partial/uncached)
    if (!message.content && !message.attachments?.size) return;

    // Truncate content if too long
    const maxLength = 1024;
    const content = message.content?.length > maxLength
        ? message.content.slice(0, maxLength - 3) + '...'
        : (message.content || '*No text content*');

    const fields = [
        {
            name: 'Content',
            value: content,
            inline: false,
        },
    ];

    // Add attachment info if any
    if (message.attachments?.size > 0) {
        const attachmentList = message.attachments.map(a => a.name).join(', ');
        fields.push({
            name: 'Attachments',
            value: attachmentList.slice(0, 1024),
            inline: false,
        });
    }

    try {
        await logChannel.send({
            embeds: [{
                color: 0xED4245, // Red color for deletes
                author: {
                    name: message.author?.tag || 'Unknown User',
                    icon_url: message.author?.displayAvatarURL({ dynamic: true }),
                },
                title: `Message Deleted in #${message.channel.name}`,
                fields,
                footer: {
                    text: `User ID: ${message.author?.id || 'Unknown'}`,
                },
                timestamp: new Date().toISOString(),
            }],
        });

        // Add to audit log
        addAuditLog(
            message.guild.id,
            'MESSAGE_DELETE',
            message.author?.id,
            null,
            `Deleted message in #${message.channel.name}`
        );
    } catch (error) {
        console.error('[ERROR] Failed to log message delete:', error);
    }
});

// Handle reactions for starboard
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;

    // Fetch partial reaction
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch {
            return;
        }
    }

    if (!reaction.message.guild) return;
    if (!checkGuildAccess(reaction.message.guild.id)) return;

    // Only handle star reactions
    if (reaction.emoji.name !== '⭐') return;

    const settings = getGuildSettings(reaction.message.guild.id);

    if (!settings.starboard_enabled || !settings.starboard_channel_id) return;

    const threshold = settings.starboard_threshold || 3;
    if (reaction.count < threshold) return;

    // Check if already on starboard
    const existing = getStarboardMessage(reaction.message.guild.id, reaction.message.id);
    if (existing) return;

    const starboardChannel = reaction.message.guild.channels.cache.get(settings.starboard_channel_id);
    if (!starboardChannel) return;

    // Don't star messages from the starboard channel
    if (reaction.message.channel.id === starboardChannel.id) return;

    // Create starboard embed
    const embed = {
        color: 0xFFAC33,
        author: {
            name: reaction.message.author.tag,
            icon_url: reaction.message.author.displayAvatarURL({ dynamic: true }),
        },
        description: reaction.message.content || '*No text content*',
        fields: [
            {
                name: 'Source',
                value: `[Jump to message](${reaction.message.url})`,
                inline: true,
            },
        ],
        footer: {
            text: `⭐ ${reaction.count} | ${reaction.message.channel.name}`,
        },
        timestamp: reaction.message.createdAt.toISOString(),
    };

    // Add image if present
    const attachment = reaction.message.attachments.first();
    if (attachment && attachment.contentType?.startsWith('image/')) {
        embed.image = { url: attachment.url };
    }

    try {
        const starMessage = await starboardChannel.send({ embeds: [embed] });
        addStarboardMessage(reaction.message.guild.id, reaction.message.id, starMessage.id, reaction.count);
    } catch (error) {
        console.error('[ERROR] Failed to post to starboard:', error);
    }

    // Handle reaction roles
    await handleReactionRoleAdd(reaction, user);
});

// Handle reaction role assignments
async function handleReactionRoleAdd(reaction, user) {
    if (!reaction.message.guild) return;

    // Get emoji identifier (ID for custom, name for unicode)
    const emojiIdentifier = reaction.emoji.id || reaction.emoji.name;

    // Check if this is a reaction role
    const reactionRole = getReactionRole(
        reaction.message.guild.id,
        reaction.message.id,
        emojiIdentifier
    );

    if (!reactionRole) return;

    // Get the member and add the role
    try {
        const member = await reaction.message.guild.members.fetch(user.id);
        const role = reaction.message.guild.roles.cache.get(reactionRole.role_id);

        if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            console.log(`[INFO] Added role ${role.name} to ${user.tag} via reaction role`);
        }
    } catch (error) {
        console.error('[ERROR] Failed to add reaction role:', error);
    }
}

// Handle reaction removal for reaction roles
client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;

    // Fetch partial reaction
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch {
            return;
        }
    }

    if (!reaction.message.guild) return;
    if (!checkGuildAccess(reaction.message.guild.id)) return;

    // Get emoji identifier
    const emojiIdentifier = reaction.emoji.id || reaction.emoji.name;

    // Check if this is a reaction role
    const reactionRole = getReactionRole(
        reaction.message.guild.id,
        reaction.message.id,
        emojiIdentifier
    );

    if (!reactionRole) return;

    // Get the member and remove the role
    try {
        const member = await reaction.message.guild.members.fetch(user.id);
        const role = reaction.message.guild.roles.cache.get(reactionRole.role_id);

        if (role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            console.log(`[INFO] Removed role ${role.name} from ${user.tag} via reaction role`);
        }
    } catch (error) {
        console.error('[ERROR] Failed to remove reaction role:', error);
    }
});

// Voice channel XP tracking
// Award XP every 5 minutes to users in voice channels
const voiceXpInterval = 5 * 60 * 1000; // 5 minutes
const voiceXpAmount = { min: 5, max: 10 }; // XP range per interval

setInterval(async () => {
    for (const [guildId, guild] of client.guilds.cache) {
        if (!checkGuildAccess(guildId)) continue;

        // Get all voice channels with members
        for (const [, channel] of guild.channels.cache) {
            if (channel.type !== 2) continue; // 2 = GuildVoice

            // Get non-bot members in the voice channel
            const members = channel.members.filter(m => !m.user.bot);

            // Require at least 2 people to prevent solo AFK farming
            if (members.size < 2) continue;

            // Award XP to each member
            for (const [, member] of members) {
                // Skip if member is server deafened (likely AFK)
                if (member.voice.serverDeaf) continue;

                // Award random XP
                const xpGained = Math.floor(Math.random() * (voiceXpAmount.max - voiceXpAmount.min + 1)) + voiceXpAmount.min;
                const result = addXp(guildId, member.user.id, xpGained);

                // Check for level up - notify in configured level channel
                if (result && result.leveledUp) {
                    // Get guild settings to check for level channel
                    const settings = getGuildSettings(guildId);

                    // Check if level notifications are enabled (default: enabled if not set)
                    const levelEnabled = settings?.level_enabled !== 0;

                    if (levelEnabled) {
                        let targetChannel = null;

                        if (settings?.level_channel_id) {
                            // Use configured level channel
                            targetChannel = guild.channels.cache.get(settings.level_channel_id);
                        }

                        // Fallback: try to find a general/chat channel
                        if (!targetChannel) {
                            targetChannel = guild.channels.cache.find(
                                c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages')
                            );
                        }

                        if (targetChannel) {
                            try {
                                await targetChannel.send({
                                    content: `🎉 ${member.user} leveled up to **Level ${result.newLevel}** while vibing in voice!`,
                                });
                            } catch {
                                // Couldn't send
                            }
                        }
                    }
                }
            }
        }
    }
}, voiceXpInterval);

console.log('[INFO] Voice XP tracker initialized (awards XP every 5 minutes)');

// Handle bot joining a new guild
client.on(Events.GuildCreate, (guild) => {
    console.log(`[INFO] Joined new guild: ${guild.name} (${guild.id})`);

    if (!checkGuildAccess(guild.id)) {
        console.log(`[INFO] Guild ${guild.id} is not in allowlist, leaving...`);
        guild.leave().catch(console.error);
    }
});

// Handle errors
client.on(Events.Error, (error) => {
    console.error('[ERROR] Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('[ERROR] Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('[INFO] Shutting down...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('[INFO] Shutting down...');
    client.destroy();
    process.exit(0);
});

// Login to Discord
client.login(config.token);
