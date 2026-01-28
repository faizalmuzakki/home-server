import { SlashCommandBuilder, ChannelType, MessageFlags } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Get information about the server'),

    async execute(interaction) {
        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        // Fetch all members to get accurate count
        await guild.members.fetch();

        const owner = await guild.fetchOwner();
        const channels = guild.channels.cache;
        const roles = guild.roles.cache;
        const emojis = guild.emojis.cache;

        // Count channel types
        const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
        const categories = channels.filter(c => c.type === ChannelType.GuildCategory).size;
        const forumChannels = channels.filter(c => c.type === ChannelType.GuildForum).size;
        const stageChannels = channels.filter(c => c.type === ChannelType.GuildStageVoice).size;

        // Count member types
        const totalMembers = guild.memberCount;
        const botCount = guild.members.cache.filter(m => m.user.bot).size;
        const humanCount = totalMembers - botCount;
        const onlineCount = guild.members.cache.filter(m =>
            m.presence?.status && m.presence.status !== 'offline'
        ).size;

        // Emoji counts
        const regularEmojis = emojis.filter(e => !e.animated).size;
        const animatedEmojis = emojis.filter(e => e.animated).size;

        // Verification level mapping
        const verificationLevels = {
            0: 'None',
            1: 'Low',
            2: 'Medium',
            3: 'High',
            4: 'Very High',
        };

        // Boost info
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;

        const embed = {
            color: 0x5865F2,
            title: guild.name,
            thumbnail: {
                url: guild.iconURL({ dynamic: true, size: 256 }),
            },
            fields: [
                {
                    name: 'Owner',
                    value: `${owner.user.tag}`,
                    inline: true,
                },
                {
                    name: 'Created',
                    value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
                    inline: true,
                },
                {
                    name: 'Server ID',
                    value: guild.id,
                    inline: true,
                },
                {
                    name: `Members (${totalMembers})`,
                    value: `👤 ${humanCount} humans\n🤖 ${botCount} bots\n🟢 ${onlineCount} online`,
                    inline: true,
                },
                {
                    name: `Channels (${channels.size})`,
                    value: `💬 ${textChannels} text\n🔊 ${voiceChannels} voice\n📁 ${categories} categories${forumChannels ? `\n📋 ${forumChannels} forums` : ''}${stageChannels ? `\n🎭 ${stageChannels} stages` : ''}`,
                    inline: true,
                },
                {
                    name: `Roles (${roles.size - 1})`,
                    value: roles.size > 1
                        ? roles.filter(r => r.id !== guild.id)
                            .sort((a, b) => b.position - a.position)
                            .first(10)
                            .map(r => r.toString())
                            .join(', ') + (roles.size > 11 ? `\n...and ${roles.size - 11} more` : '')
                        : 'No roles',
                    inline: false,
                },
                {
                    name: `Emojis (${emojis.size})`,
                    value: `😀 ${regularEmojis} regular\n✨ ${animatedEmojis} animated`,
                    inline: true,
                },
                {
                    name: 'Boost Status',
                    value: `Level ${boostLevel}\n${boostCount} boosts`,
                    inline: true,
                },
                {
                    name: 'Verification',
                    value: verificationLevels[guild.verificationLevel] || 'Unknown',
                    inline: true,
                },
            ],
            footer: {
                text: `Requested by ${interaction.user.tag}`,
            },
            timestamp: new Date().toISOString(),
        };

        // Add banner if exists
        if (guild.banner) {
            embed.image = {
                url: guild.bannerURL({ size: 1024 }),
            };
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
