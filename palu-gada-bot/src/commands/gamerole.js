import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import {
    addReactionRole,
    getReactionRolesByRole,
    removeReactionRole,
    addGamingRole,
    getGamingRole,
    removeGamingRole,
    getGamingRoleMenu,
} from '../database/models.js';
import { updateReactionRoleEmbed } from './reactionrole.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gamerole')
        .setDescription('Create or delete gaming roles')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a gaming role (mentionable, no extra permissions)')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Game name, e.g. Mobile Legends')
                        .setRequired(true)
                        .setMaxLength(100)
                )
                .addStringOption(option =>
                    option
                        .setName('color')
                        .setDescription('Hex color, e.g. #415f8d')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('emoji')
                        .setDescription('Add the role to the gaming reaction-role menu with this emoji')
                )
                .addBooleanOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Also create a private channel for this role in the Gaming category (default: no)')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a gaming role')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Gaming role to delete')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        await interaction.deferReply({});

        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (subcommand === 'create') {
            const name = interaction.options.getString('name').trim();
            const colorInput = interaction.options.getString('color').trim();
            const emojiInput = interaction.options.getString('emoji')?.trim();
            const wantChannel = interaction.options.getBoolean('channel') ?? false;

            if (!/^#?[0-9a-f]{6}$/i.test(colorInput)) {
                return interaction.editReply({ content: 'Color must be a 6-digit hex like `#415f8d`.' });
            }
            const color = parseInt(colorInput.replace('#', ''), 16);

            if (guild.roles.cache.some(r => r.name.toLowerCase() === name.toLowerCase())) {
                return interaction.editReply({ content: `A role named **${name}** already exists.` });
            }

            // Same setup as the existing gaming roles: mentionable, no extra permissions, not hoisted
            let role;
            try {
                role = await guild.roles.create({
                    name,
                    color,
                    mentionable: true,
                    hoist: false,
                    permissions: [],
                    reason: `/gamerole create by ${interaction.user.tag}`,
                });
            } catch (error) {
                console.error('[ERROR] Failed to create gaming role:', error);
                return interaction.editReply({ content: 'Failed to create the role. Check my Manage Roles permission.' });
            }

            const notes = [];

            let channel = null;
            if (wantChannel) {
                const category = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'gaming'
                );
                try {
                    channel = await guild.channels.create({
                        name,
                        type: ChannelType.GuildText,
                        parent: category?.id,
                        permissionOverwrites: [
                            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: role.id, allow: [PermissionFlagsBits.ViewChannel] },
                        ],
                        reason: `/gamerole create by ${interaction.user.tag}`,
                    });
                    if (!category) notes.push('No "Gaming" category found, so the channel is at the top level.');
                } catch (error) {
                    console.error('[ERROR] Failed to create gaming channel:', error);
                    notes.push('⚠️ Failed to create the channel. Check my Manage Channels permission.');
                }
            }

            addGamingRole(guild.id, role.id, channel?.id ?? null);

            if (emojiInput) {
                const menu = getGamingRoleMenu(guild.id);
                if (!menu) {
                    notes.push('No gaming reaction-role menu found. Use `/reactionrole add` to add it to one.');
                } else {
                    try {
                        const menuChannel = await guild.channels.fetch(menu.channel_id);
                        const message = await menuChannel.messages.fetch(menu.message_id);
                        await message.react(emojiInput);
                        const customEmojiMatch = emojiInput.match(/<a?:(\w+):(\d+)>/);
                        addReactionRole(guild.id, menu.channel_id, menu.message_id, customEmojiMatch ? customEmojiMatch[2] : emojiInput, role.id);
                        await updateReactionRoleEmbed(message, guild.id);
                        notes.push(`Added to the [reaction-role menu](${message.url}) as ${emojiInput}.`);
                    } catch (error) {
                        console.error('[ERROR] Failed to add gaming role to menu:', error);
                        notes.push('⚠️ Failed to add it to the reaction-role menu. Is the emoji valid?');
                    }
                }
            }

            return interaction.editReply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Gaming Role Created',
                    description: [`${role}${channel ? ` with ${channel}` : ''}`, ...notes].join('\n'),
                }],
            });

        } else if (subcommand === 'delete') {
            const role = interaction.options.getRole('role');
            const record = getGamingRole(guild.id, role.id);

            if (!record) {
                return interaction.editReply({ content: `${role} is not a gaming role, so I won't delete it.` });
            }
            if (role.position >= guild.members.me.roles.highest.position) {
                return interaction.editReply({ content: 'I cannot delete this role because it\'s higher than or equal to my highest role.' });
            }

            // Drop it from any reaction-role menus first, while the role still resolves
            for (const rr of getReactionRolesByRole(guild.id, role.id)) {
                removeReactionRole(guild.id, rr.message_id, rr.emoji);
                try {
                    const menuChannel = await guild.channels.fetch(rr.channel_id);
                    const message = await menuChannel.messages.fetch(rr.message_id);
                    const reaction = message.reactions.cache.find(r => (r.emoji.id || r.emoji.name) === rr.emoji);
                    if (reaction) await reaction.remove();
                    await updateReactionRoleEmbed(message, guild.id);
                } catch (error) {
                    console.error('[ERROR] Failed to clean up reaction-role menu:', error);
                }
            }

            const roleName = role.name;
            try {
                await role.delete(`/gamerole delete by ${interaction.user.tag}`);
            } catch (error) {
                console.error('[ERROR] Failed to delete gaming role:', error);
                return interaction.editReply({ content: 'Failed to delete the role. Check my Manage Roles permission.' });
            }
            removeGamingRole(guild.id, role.id);

            // Channel is kept on purpose (chat history); it's admin-only once the role is gone
            const channel = record.channel_id && guild.channels.cache.get(record.channel_id);
            return interaction.editReply({
                embeds: [{
                    color: 0x57F287,
                    title: '🗑️ Gaming Role Deleted',
                    description: `Deleted **${roleName}**.` + (channel ? `\n${channel} was kept and is now admin-only. Delete it by hand if it's no longer needed.` : ''),
                }],
            });
        }
    },
};
