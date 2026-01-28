import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('qrcode')
        .setDescription('Generate a QR code')
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription('Text or URL to encode')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('size')
                .setDescription('QR code size in pixels')
                .setRequired(false)
                .addChoices(
                    { name: 'Small (150x150)', value: 150 },
                    { name: 'Medium (300x300)', value: 300 },
                    { name: 'Large (500x500)', value: 500 }
                )
        ),

    async execute(interaction) {
        const text = interaction.options.getString('text');
        const size = interaction.options.getInteger('size') || 300;

        await interaction.deferReply();

        try {
            // Use QR Server API (free, no auth required)
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&format=png`;

            // Fetch the QR code image
            const response = await fetch(qrUrl);

            if (!response.ok) {
                throw new Error('Failed to generate QR code');
            }

            const buffer = await response.arrayBuffer();
            const attachment = new AttachmentBuilder(Buffer.from(buffer), { name: 'qrcode.png' });

            const embed = {
                color: 0x5865F2,
                title: '📱 QR Code Generated',
                description: text.length > 100 ? text.slice(0, 100) + '...' : text,
                image: {
                    url: 'attachment://qrcode.png',
                },
                footer: {
                    text: `Size: ${size}x${size}px`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({
                embeds: [embed],
                files: [attachment],
            });

        } catch (error) {
            await logCommandError(interaction, error, 'qrcode');
            await interaction.editReply({
                content: 'Failed to generate QR code. Please try again.',
            });
        }
    },
};
