import { Events } from 'discord.js';
import {
    getGuildSettings, getStarboardMessage, addStarboardMessage,
    updateStarboardCount, getReactionRole,
} from '../database/models.js';
import { checkGuildAccess } from '../config.js';

async function handleReactionRoleAdd(reaction, user) {
    if (!reaction.message.guild) return;

    const emojiIdentifier = reaction.emoji.id || reaction.emoji.name;

    const reactionRole = getReactionRole(
        reaction.message.guild.id,
        reaction.message.id,
        emojiIdentifier
    );

    if (!reactionRole) return;

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

export function register(client) {
    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        if (user.bot) return;

        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch {
                return;
            }
        }

        if (!reaction.message.guild) return;
        if (!checkGuildAccess(reaction.message.guild.id)) return;

        if (reaction.emoji.name !== '⭐') {
            await handleReactionRoleAdd(reaction, user);
            return;
        }

        const settings = getGuildSettings(reaction.message.guild.id);
        if (!settings.starboard_enabled || !settings.starboard_channel_id) {
            await handleReactionRoleAdd(reaction, user);
            return;
        }

        const threshold = settings.starboard_threshold || 3;
        if (reaction.count < threshold) {
            await handleReactionRoleAdd(reaction, user);
            return;
        }

        const starboardChannel = reaction.message.guild.channels.cache.get(settings.starboard_channel_id);
        if (!starboardChannel) {
            await handleReactionRoleAdd(reaction, user);
            return;
        }

        if (reaction.message.channel.id === starboardChannel.id) return;

        const existing = getStarboardMessage(reaction.message.guild.id, reaction.message.id);

        if (existing) {
            updateStarboardCount(reaction.message.guild.id, reaction.message.id, reaction.count);
            try {
                const starMsg = await starboardChannel.messages.fetch(existing.starboard_message_id);
                const updatedEmbed = { ...starMsg.embeds[0].data, footer: { text: `⭐ ${reaction.count} | ${reaction.message.channel.name}` } };
                await starMsg.edit({ embeds: [updatedEmbed] });
            } catch {
                // Starboard message may have been deleted — ignore
            }
            await handleReactionRoleAdd(reaction, user);
            return;
        }

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

        await handleReactionRoleAdd(reaction, user);
    });
}
