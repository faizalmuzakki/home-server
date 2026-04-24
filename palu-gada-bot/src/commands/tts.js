import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { getQueue } from '../utils/musicPlayer.js';
import { getSession, speak } from '../utils/ttsPlayer.js';

const MAX_TEXT_CHARS = 500;

export default {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('Speak text in your voice channel via Google Translate TTS')
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription(`Text to speak (max ${MAX_TEXT_CHARS} characters)`)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('language')
                .setDescription('Language code (e.g. en, id, ja, es). Default: en')
                .setRequired(false)
        ),

    async execute(interaction) {
        const rawText = interaction.options.getString('text') ?? '';
        const text = rawText.trim();
        const lang = (interaction.options.getString('language') ?? 'en').trim();
        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: 'You need to be in a voice channel to use TTS!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.reply({
                content: 'I need permissions to join and speak in your voice channel!',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (text.length === 0) {
            return interaction.reply({
                content: 'Text cannot be empty.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (text.length > MAX_TEXT_CHARS) {
            return interaction.reply({
                content: `Text must be ${MAX_TEXT_CHARS} characters or fewer (you sent ${text.length}).`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const musicQueue = getQueue(interaction.guildId);
        if (musicQueue && (musicQueue.playing || musicQueue.songs.length > 0)) {
            return interaction.reply({
                content: "Can't use TTS while music is playing. Run `/stop` first.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const existingTts = getSession(interaction.guildId);
        if (existingTts?.speaking) {
            return interaction.reply({
                content: 'Already speaking — wait for the current TTS to finish.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        try {
            await speak(voiceChannel, interaction.channel, text, lang);
            const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text;
            await interaction.editReply({
                content: `🔊 Spoke: "${preview}"`,
            });
        } catch (error) {
            await logCommandError(interaction, error, 'tts');
            await interaction.editReply({
                content: `Error: ${error.message}`,
            });
        }
    },
};
