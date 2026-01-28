import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('emoji')
        .setDescription('Get information about an emoji')
        .addStringOption(option =>
            option
                .setName('emoji')
                .setDescription('The emoji to get info about')
                .setRequired(true)
        ),

    async execute(interaction) {
        const input = interaction.options.getString('emoji').trim();

        // Check if it's a custom Discord emoji
        const customEmojiMatch = input.match(/<(a)?:(\w+):(\d+)>/);

        if (customEmojiMatch) {
            // Custom emoji
            const isAnimated = !!customEmojiMatch[1];
            const emojiName = customEmojiMatch[2];
            const emojiId = customEmojiMatch[3];
            const extension = isAnimated ? 'gif' : 'png';
            const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}`;

            const embed = {
                color: 0x5865F2,
                title: `Custom Emoji: ${emojiName}`,
                thumbnail: {
                    url: emojiUrl,
                },
                fields: [
                    {
                        name: 'Name',
                        value: `:${emojiName}:`,
                        inline: true,
                    },
                    {
                        name: 'ID',
                        value: emojiId,
                        inline: true,
                    },
                    {
                        name: 'Animated',
                        value: isAnimated ? 'Yes' : 'No',
                        inline: true,
                    },
                    {
                        name: 'Raw',
                        value: `\`${input}\``,
                        inline: false,
                    },
                    {
                        name: 'Image URL',
                        value: `[Download](${emojiUrl}?size=128)`,
                        inline: true,
                    },
                ],
                image: {
                    url: `${emojiUrl}?size=128`,
                },
            };

            // Try to find in guild emojis
            const guildEmoji = interaction.guild?.emojis.cache.get(emojiId);
            if (guildEmoji) {
                embed.fields.push({
                    name: 'Guild',
                    value: `From this server`,
                    inline: true,
                });
                if (guildEmoji.roles.cache.size > 0) {
                    embed.fields.push({
                        name: 'Restricted to Roles',
                        value: guildEmoji.roles.cache.map(r => r.toString()).join(', '),
                        inline: true,
                    });
                }
            }

            return interaction.reply({ embeds: [embed] });
        }

        // Unicode emoji
        const codePoints = [...input].map(char => {
            const hex = char.codePointAt(0).toString(16).toUpperCase();
            return `U+${hex.padStart(4, '0')}`;
        });

        // Get emoji name from unicode.org (simplified approach)
        const firstCodePoint = input.codePointAt(0);
        let emojiName = 'Unknown';

        // Common emoji names (simplified list)
        const emojiNames = {
            '😀': 'Grinning Face',
            '😃': 'Grinning Face with Big Eyes',
            '😄': 'Grinning Face with Smiling Eyes',
            '😁': 'Beaming Face with Smiling Eyes',
            '😅': 'Grinning Face with Sweat',
            '😂': 'Face with Tears of Joy',
            '🤣': 'Rolling on the Floor Laughing',
            '😊': 'Smiling Face with Smiling Eyes',
            '😇': 'Smiling Face with Halo',
            '❤️': 'Red Heart',
            '👍': 'Thumbs Up',
            '👎': 'Thumbs Down',
            '🎉': 'Party Popper',
            '🔥': 'Fire',
            '💯': 'Hundred Points',
            '✨': 'Sparkles',
            '⭐': 'Star',
            '🌟': 'Glowing Star',
            '💀': 'Skull',
            '👀': 'Eyes',
            '🤔': 'Thinking Face',
            '🙄': 'Face with Rolling Eyes',
            '😎': 'Smiling Face with Sunglasses',
            '🤯': 'Exploding Head',
            '🥺': 'Pleading Face',
            '😭': 'Loudly Crying Face',
            '😱': 'Face Screaming in Fear',
            '🤮': 'Face Vomiting',
            '💩': 'Pile of Poo',
            '👻': 'Ghost',
            '🤖': 'Robot',
            '👽': 'Alien',
        };

        emojiName = emojiNames[input] || `Unicode Character`;

        // Create Twemoji URL for preview
        const twemojiCodePoints = [...input]
            .map(char => char.codePointAt(0).toString(16))
            .join('-')
            .replace(/-fe0f/g, ''); // Remove variation selectors for twemoji

        const twemojiUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14/assets/72x72/${twemojiCodePoints}.png`;

        const embed = {
            color: 0x5865F2,
            title: `Emoji: ${input}`,
            thumbnail: {
                url: twemojiUrl,
            },
            fields: [
                {
                    name: 'Name',
                    value: emojiName,
                    inline: true,
                },
                {
                    name: 'Type',
                    value: 'Unicode',
                    inline: true,
                },
                {
                    name: 'Code Points',
                    value: codePoints.join(' '),
                    inline: false,
                },
                {
                    name: 'JavaScript Escape',
                    value: `\`${[...input].map(c => `\\u{${c.codePointAt(0).toString(16)}}`).join('')}\``,
                    inline: false,
                },
                {
                    name: 'HTML Entity',
                    value: `\`${[...input].map(c => `&#x${c.codePointAt(0).toString(16)};`).join('')}\``,
                    inline: false,
                },
            ],
        };

        await interaction.reply({ embeds: [embed] });
    },
};
