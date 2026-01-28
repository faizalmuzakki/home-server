import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } from 'discord.js';
import {
    addReactionRole,
    getReactionRole,
    getReactionRolesByMessage,
    getReactionRolesByGuild,
    removeReactionRole,
    removeReactionRolesByMessage,
} from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Set up reaction roles for your server')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new reaction role message')
                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('Title for the reaction role embed')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Description/instructions for users')
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send the message (defaults to current)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add an emoji-role mapping to a reaction role message')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel containing the message')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('The message ID to add the reaction role to')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('The emoji to react with')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to assign when users react')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an emoji-role mapping')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('The message ID to remove the reaction from')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('The emoji to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all reaction role setups in this server')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete an entire reaction role setup')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('The message ID to delete the setup for')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        // Defer reply to prevent timeout (Discord has 3-second limit)
        await interaction.deferReply({});

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            // Check if channel is a text channel
            if (!channel.isTextBased()) {
                return interaction.editReply({
                    content: 'Please select a text channel.',

                });
            }

            // Check bot permissions in target channel
            const botMember = interaction.guild.members.me;
            if (!channel.permissionsFor(botMember).has(['SendMessages', 'AddReactions'])) {
                return interaction.editReply({
                    content: 'I need `Send Messages` and `Add Reactions` permissions in that channel.',

                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: 'React to get your roles!' })
                .setTimestamp();

            try {
                const message = await channel.send({ embeds: [embed] });

                await interaction.editReply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ Reaction Role Message Created',
                        description: `Message created in ${channel}!\n\n**Message ID:** \`${message.id}\`\n\nUse \`/reactionrole add\` to add emoji-role mappings.`,
                    }],

                });
            } catch (error) {
                console.error('[ERROR] Failed to create reaction role message:', error);
                return interaction.editReply({
                    content: 'Failed to create the reaction role message. Check my permissions.',

                });
            }

        } else if (subcommand === 'add') {
            const targetChannel = interaction.options.getChannel('channel');
            const messageId = interaction.options.getString('message_id');
            const emojiInput = interaction.options.getString('emoji');
            const role = interaction.options.getRole('role');

            // Check if channel is a text channel
            if (!targetChannel.isTextBased()) {
                return interaction.editReply({
                    content: 'Please select a text channel.',
                });
            }

            // Check if bot can assign this role
            const botMember = interaction.guild.members.me;
            if (role.position >= botMember.roles.highest.position) {
                return interaction.editReply({
                    content: 'I cannot assign this role because it\'s higher than or equal to my highest role.',
                });
            }

            // Check if role is managed
            if (role.managed) {
                return interaction.editReply({
                    content: 'This role is managed by an integration and cannot be assigned.',
                });
            }

            // Check if it's @everyone
            if (role.id === interaction.guildId) {
                return interaction.editReply({
                    content: 'You cannot use the @everyone role.',
                });
            }

            // Parse emoji - handle both unicode and custom emojis
            let emoji = emojiInput.trim();
            let emojiIdentifier = emoji;

            // Check for custom emoji format: <:name:id> or <a:name:id>
            const customEmojiMatch = emoji.match(/<a?:(\w+):(\d+)>/);
            if (customEmojiMatch) {
                emojiIdentifier = customEmojiMatch[2]; // Use the ID for custom emojis
            }

            // Fetch the message directly from the specified channel
            let targetMessage = null;
            try {
                targetMessage = await targetChannel.messages.fetch(messageId);
            } catch {
                return interaction.editReply({
                    content: `Could not find a message with ID \`${messageId}\` in ${targetChannel}.`,
                });
            }

            // Check if the message is from the bot
            if (targetMessage.author.id !== interaction.client.user.id) {
                return interaction.editReply({
                    content: 'You can only add reaction roles to messages sent by me. Use `/reactionrole create` first.',
                });
            }

            // Add the reaction to the message
            try {
                await targetMessage.react(emoji);
            } catch (error) {
                console.error('[ERROR] Failed to add reaction:', error);
                return interaction.editReply({
                    content: 'Failed to add the reaction. Make sure the emoji is valid and I have permission to add reactions.',

                });
            }

            // Save to database
            addReactionRole(interaction.guildId, targetChannel.id, messageId, emojiIdentifier, role.id);

            // Update the embed to show the new mapping
            await updateReactionRoleEmbed(targetMessage, interaction.guildId);

            await interaction.editReply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Reaction Role Added',
                    description: `Users can now react with ${emoji} to get the ${role} role!`,
                }],

            });

        } else if (subcommand === 'remove') {
            const messageId = interaction.options.getString('message_id');
            const emojiInput = interaction.options.getString('emoji');

            // Parse emoji
            let emojiIdentifier = emojiInput.trim();
            const customEmojiMatch = emojiInput.match(/<a?:(\w+):(\d+)>/);
            if (customEmojiMatch) {
                emojiIdentifier = customEmojiMatch[2];
            }

            // Check if mapping exists
            const existing = getReactionRole(interaction.guildId, messageId, emojiIdentifier);
            if (!existing) {
                return interaction.editReply({
                    content: 'No reaction role found with that emoji on that message.',

                });
            }

            // Remove from database
            removeReactionRole(interaction.guildId, messageId, emojiIdentifier);

            // Try to remove the reaction from the message
            try {
                const channel = await interaction.guild.channels.fetch(existing.channel_id);
                const message = await channel.messages.fetch(messageId);

                // Find and remove the bot's reaction
                const reaction = message.reactions.cache.find(r => {
                    const reactionEmoji = r.emoji.id || r.emoji.name;
                    return reactionEmoji === emojiIdentifier;
                });

                if (reaction) {
                    await reaction.users.remove(interaction.client.user.id);
                }

                // Update the embed
                await updateReactionRoleEmbed(message, interaction.guildId);
            } catch (error) {
                console.error('[ERROR] Failed to remove reaction from message:', error);
            }

            await interaction.editReply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Reaction Role Removed',
                    description: `Removed the reaction role mapping for ${emojiInput}.`,
                }],

            });

        } else if (subcommand === 'list') {
            const reactionRoles = getReactionRolesByGuild(interaction.guildId);

            if (reactionRoles.length === 0) {
                return interaction.editReply({
                    embeds: [{
                        color: 0x5865F2,
                        title: '📋 Reaction Roles',
                        description: 'No reaction roles set up in this server.\n\nUse `/reactionrole create` to get started!',
                    }],

                });
            }

            // Group by message
            const grouped = {};
            for (const rr of reactionRoles) {
                if (!grouped[rr.message_id]) {
                    grouped[rr.message_id] = {
                        channel_id: rr.channel_id,
                        roles: [],
                    };
                }
                grouped[rr.message_id].roles.push(rr);
            }

            const fields = [];
            for (const [messageId, data] of Object.entries(grouped)) {
                const roleList = data.roles.map(rr => {
                    const role = interaction.guild.roles.cache.get(rr.role_id);
                    const emoji = interaction.guild.emojis.cache.get(rr.emoji) || rr.emoji;
                    return `${emoji} → ${role || 'Deleted Role'}`;
                }).join('\n');

                fields.push({
                    name: `Message: \`${messageId}\``,
                    value: `Channel: <#${data.channel_id}>\n${roleList}`,
                    inline: false,
                });
            }

            await interaction.editReply({
                embeds: [{
                    color: 0x5865F2,
                    title: '📋 Reaction Roles',
                    fields: fields.slice(0, 25), // Discord limit
                    footer: { text: `${reactionRoles.length} total mapping(s)` },
                }],

            });

        } else if (subcommand === 'delete') {
            const messageId = interaction.options.getString('message_id');

            // Check if any mappings exist
            const existing = getReactionRolesByMessage(interaction.guildId, messageId);
            if (existing.length === 0) {
                return interaction.editReply({
                    content: 'No reaction roles found for that message.',

                });
            }

            // Remove all mappings
            removeReactionRolesByMessage(interaction.guildId, messageId);

            // Try to delete the message
            try {
                const channel = await interaction.guild.channels.fetch(existing[0].channel_id);
                const message = await channel.messages.fetch(messageId);
                await message.delete();
            } catch (error) {
                // Message might already be deleted
            }

            await interaction.editReply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Reaction Role Setup Deleted',
                    description: `Removed ${existing.length} reaction role mapping(s) and deleted the message.`,
                }],

            });
        }
    },
};

// Helper function to update the reaction role embed with current mappings
async function updateReactionRoleEmbed(message, guildId) {
    const mappings = getReactionRolesByMessage(guildId, message.id);

    if (message.embeds.length === 0) return;

    const originalEmbed = message.embeds[0];
    const guild = message.guild;

    // Build the roles description
    let rolesDescription = '';
    for (const mapping of mappings) {
        const role = guild.roles.cache.get(mapping.role_id);
        const emoji = guild.emojis.cache.get(mapping.emoji) || mapping.emoji;
        if (role) {
            rolesDescription += `${emoji} → ${role}\n`;
        }
    }

    // Update embed
    const newEmbed = new EmbedBuilder()
        .setColor(originalEmbed.color || 0x5865F2)
        .setTitle(originalEmbed.title || 'Reaction Roles')
        .setDescription(
            (originalEmbed.description?.split('\n\n**Roles:**')[0] || 'React to get your roles!') +
            (rolesDescription ? `\n\n**Roles:**\n${rolesDescription}` : '')
        )
        .setFooter({ text: 'React to get your roles!' })
        .setTimestamp();

    try {
        await message.edit({ embeds: [newEmbed] });
    } catch (error) {
        console.error('[ERROR] Failed to update reaction role embed:', error);
    }
}
