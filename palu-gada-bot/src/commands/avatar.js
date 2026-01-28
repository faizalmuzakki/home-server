import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get the avatar of a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to get the avatar of (defaults to yourself)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('size')
                .setDescription('Avatar size')
                .setRequired(false)
                .addChoices(
                    { name: '64x64', value: '64' },
                    { name: '128x128', value: '128' },
                    { name: '256x256', value: '256' },
                    { name: '512x512', value: '512' },
                    { name: '1024x1024', value: '1024' },
                    { name: '2048x2048', value: '2048' },
                    { name: '4096x4096', value: '4096' }
                )
        ),

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const size = parseInt(interaction.options.getString('size') || '1024');

        const avatarUrl = user.displayAvatarURL({
            dynamic: true,
            size: size,
            format: 'png'
        });

        // Try to get guild-specific avatar if in a guild
        let guildAvatarUrl = null;
        if (interaction.guild) {
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (member && member.avatar) {
                guildAvatarUrl = member.displayAvatarURL({
                    dynamic: true,
                    size: size,
                    format: 'png'
                });
            }
        }

        const embed = {
            color: 0x5865F2,
            title: `${user.tag}'s Avatar`,
            image: {
                url: guildAvatarUrl || avatarUrl,
            },
            fields: [],
            footer: {
                text: `Requested by ${interaction.user.tag}`,
            },
            timestamp: new Date().toISOString(),
        };

        // Add links to different formats
        const formats = ['png', 'jpg', 'webp'];
        if (user.avatar?.startsWith('a_')) {
            formats.push('gif');
        }

        const links = formats.map(format =>
            `[${format.toUpperCase()}](${user.displayAvatarURL({ format, size })})`
        ).join(' | ');

        embed.description = `**Download:** ${links}`;

        if (guildAvatarUrl && guildAvatarUrl !== avatarUrl) {
            embed.fields.push({
                name: 'Server Avatar',
                value: `[Click here](${guildAvatarUrl})`,
                inline: true,
            });
            embed.fields.push({
                name: 'Global Avatar',
                value: `[Click here](${avatarUrl})`,
                inline: true,
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
