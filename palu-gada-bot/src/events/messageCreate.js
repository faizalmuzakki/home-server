import { Events, ChannelType } from 'discord.js';
import {
    addXp, getGuildSettings, getAfk, removeAfk,
    isThreadChannel, getAutoresponders,
} from '../database/models.js';
import db from '../database/db.js';
import config, { checkGuildAccess } from '../config.js';
import { executeCommand, formatOutput, isShellAllowed } from '../utils/shellExecutor.js';
import { formatDuration } from '../utils/timeFormat.js';
import { updateTopRoles } from '../utils/levelRoles.js';

const xpCooldowns = new Map();

export function register(client) {
    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot) return;

        if (config.shellChannelId && message.channel.id === config.shellChannelId) {
            if (!isShellAllowed(message.author.id)) {
                await message.reply({
                    content: 'You are not authorized to use the shell channel.',
                }).catch(() => {});
                return;
            }

            const command = message.content.trim();
            if (!command) return;

            await message.react('\u23F3').catch(() => {});

            try {
                const result = await executeCommand(command);
                const messages = formatOutput(result);

                await message.reactions.removeAll().catch(() => {});
                await message.react(result.exitCode === 0 ? '\u2705' : '\u274C').catch(() => {});

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

            return;
        }

        const authorAfk = getAfk(message.author.id);
        if (authorAfk) {
            removeAfk(message.author.id);

            const since = new Date(authorAfk.since);
            const duration = formatDuration(Date.now() - since.getTime());

            try {
                await message.reply({
                    content: `👋 Welcome back, ${message.author}! Your AFK status has been removed.\nYou were AFK for **${duration}**.`,
                    allowedMentions: { repliedUser: false },
                });
            } catch (e) {
                // Might not have permission
            }
        }

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
                    // Might not have permission
                }
            }
        }

        if (!message.guild) return;
        if (!checkGuildAccess(message.guild.id)) return;

        {
            const responders = getAutoresponders(message.guild.id);
            if (responders.length > 0) {
                const lowerContent = message.content.toLowerCase();
                for (const r of responders) {
                    let matched = false;
                    if (r.match_type === 'exact')      matched = lowerContent === r.trigger;
                    else if (r.match_type === 'startswith') matched = lowerContent.startsWith(r.trigger);
                    else                                matched = lowerContent.includes(r.trigger);

                    if (matched) {
                        await message.reply({ content: r.response, allowedMentions: { repliedUser: false } }).catch(() => {});
                        break;
                    }
                }
            }
        }

        if (
            message.channel.type === ChannelType.GuildText &&
            !message.hasThread &&
            isThreadChannel(message.guild.id, message.channel.id)
        ) {
            const row = db
                .prepare('SELECT archive_duration FROM thread_channels WHERE guild_id = ? AND channel_id = ?')
                .get(message.guild.id, message.channel.id);
            const archiveDuration = row?.archive_duration ?? 1440;

            const threadName = (message.content || 'Thread')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 90) || 'Thread';

            try {
                await message.startThread({
                    name: threadName,
                    autoArchiveDuration: archiveDuration,
                });
            } catch {
                // Silently skip
            }
        }

        const key = `${message.guild.id}-${message.author.id}`;
        const now = Date.now();
        const cooldownEnd = xpCooldowns.get(key);

        if (cooldownEnd && now < cooldownEnd) return;

        const xpGained = Math.floor(Math.random() * 11) + 15;
        const result = addXp(message.guild.id, message.author.id, xpGained);

        xpCooldowns.set(key, now + 60000);

        updateTopRoles(client, message.guild.id).catch(err => console.error('[ERROR] Top roles update failed:', err));

        if (result && result.leveledUp) {
            const settings = getGuildSettings(message.guild.id);
            const levelEnabled = settings?.level_enabled !== 0;

            if (levelEnabled) {
                let targetChannel = message.channel;

                if (settings?.level_channel_id) {
                    const levelChannel = message.guild.channels.cache.get(settings.level_channel_id);
                    if (levelChannel) {
                        targetChannel = levelChannel;
                    }
                }

                try {
                    await targetChannel.send({
                        content: `🎉 Congratulations ${message.author}! You've reached **Level ${result.newLevel}**!`,
                    });
                } catch {
                    // Couldn't send
                }
            }
        }
    });
}
