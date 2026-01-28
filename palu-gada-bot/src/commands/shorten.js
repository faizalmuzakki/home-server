import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shorten')
        .setDescription('Shorten a URL')
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('The URL to shorten')
                .setRequired(true)
        ),

    async execute(interaction) {
        const url = interaction.options.getString('url');

        // Validate URL
        try {
            new URL(url);
        } catch {
            return interaction.reply({
                content: 'Please provide a valid URL.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        try {
            // Use is.gd API (free, no auth required)
            const apiUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`;
            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error('Failed to shorten URL');
            }

            const data = await response.json();

            if (data.errorcode) {
                throw new Error(data.errormessage || 'URL shortening failed');
            }

            const shortUrl = data.shorturl;

            // Try to get URL stats
            let clicks = 'N/A';
            try {
                const statsResponse = await fetch(
                    `https://is.gd/stats.php?format=json&shorturl=${encodeURIComponent(shortUrl)}`
                );
                if (statsResponse.ok) {
                    const stats = await statsResponse.json();
                    clicks = stats.clicks || 0;
                }
            } catch {
                // Stats not available
            }

            const embed = {
                color: 0x57F287,
                title: '🔗 URL Shortened',
                fields: [
                    {
                        name: 'Short URL',
                        value: shortUrl,
                        inline: false,
                    },
                    {
                        name: 'Original URL',
                        value: url.length > 100 ? url.slice(0, 100) + '...' : url,
                        inline: false,
                    },
                ],
                footer: {
                    text: 'Powered by is.gd',
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await logCommandError(interaction, error, 'shorten');

            let errorMessage = 'Failed to shorten URL.';
            if (error.message.includes('blocked')) {
                errorMessage = 'This URL has been blocked by the URL shortener.';
            } else if (error.message.includes('invalid')) {
                errorMessage = 'Invalid URL provided.';
            }

            await interaction.editReply({
                content: errorMessage,
            });
        }
    },
};
