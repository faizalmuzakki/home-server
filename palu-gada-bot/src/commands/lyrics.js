import { SlashCommandBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { getQueue } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Get lyrics for the current song or a specified song')
        .addStringOption(option =>
            option
                .setName('song')
                .setDescription('Song name to search (uses current song if empty)')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        let searchQuery = interaction.options.getString('song');

        // If no song specified, try to get the current playing song
        if (!searchQuery) {
            const queue = getQueue(interaction.guildId);
            if (!queue || queue.songs.length === 0) {
                return interaction.editReply({
                    content: 'No song is currently playing. Please specify a song name.',
                });
            }
            searchQuery = queue.songs[0].title;
        }

        try {
            // Use lyrics.ovh API (free, no auth required)
            // First, try to parse artist - title format
            let artist = '';
            let title = searchQuery;

            if (searchQuery.includes(' - ')) {
                const parts = searchQuery.split(' - ');
                artist = parts[0].trim();
                title = parts.slice(1).join(' - ').trim();
            }

            // Clean up common suffixes
            title = title
                .replace(/\(Official.*?\)/gi, '')
                .replace(/\[Official.*?\]/gi, '')
                .replace(/\(Lyrics.*?\)/gi, '')
                .replace(/\[Lyrics.*?\]/gi, '')
                .replace(/\(Audio.*?\)/gi, '')
                .replace(/\[Audio.*?\]/gi, '')
                .replace(/\(Music Video\)/gi, '')
                .replace(/\[Music Video\]/gi, '')
                .replace(/\(HD\)/gi, '')
                .replace(/\[HD\]/gi, '')
                .replace(/ft\..*/gi, '')
                .replace(/feat\..*/gi, '')
                .trim();

            // Try lyrics.ovh API
            let lyrics = null;

            if (artist) {
                try {
                    const response = await fetch(
                        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
                    );
                    if (response.ok) {
                        const data = await response.json();
                        lyrics = data.lyrics;
                    }
                } catch (e) {
                    // API failed, continue to fallback
                }
            }

            // If no lyrics found, try a more general search
            if (!lyrics) {
                // Try with the full search query as title
                const words = searchQuery.split(' ');
                if (words.length >= 2) {
                    // Assume first word might be artist
                    try {
                        const response = await fetch(
                            `https://api.lyrics.ovh/v1/${encodeURIComponent(words[0])}/${encodeURIComponent(words.slice(1).join(' '))}`
                        );
                        if (response.ok) {
                            const data = await response.json();
                            lyrics = data.lyrics;
                        }
                    } catch (e) {
                        // API failed
                    }
                }
            }

            if (!lyrics) {
                return interaction.editReply({
                    content: `Could not find lyrics for **${searchQuery}**. Try specifying the song as "Artist - Title".`,
                });
            }

            // Split lyrics into chunks if too long
            const maxLength = 4000;
            if (lyrics.length > maxLength) {
                const chunks = [];
                let current = '';

                for (const line of lyrics.split('\n')) {
                    if ((current + '\n' + line).length > maxLength) {
                        chunks.push(current);
                        current = line;
                    } else {
                        current += (current ? '\n' : '') + line;
                    }
                }
                if (current) chunks.push(current);

                // Send first chunk as embed
                await interaction.editReply({
                    embeds: [{
                        color: 0x5865F2,
                        title: `🎵 ${searchQuery}`,
                        description: chunks[0],
                        footer: {
                            text: `Page 1/${chunks.length} • Lyrics may not be 100% accurate`,
                        },
                    }],
                });

                // Send remaining chunks
                for (let i = 1; i < Math.min(chunks.length, 3); i++) {
                    await interaction.followUp({
                        embeds: [{
                            color: 0x5865F2,
                            description: chunks[i],
                            footer: {
                                text: `Page ${i + 1}/${chunks.length}`,
                            },
                        }],
                    });
                }

                if (chunks.length > 3) {
                    await interaction.followUp({
                        content: '*Lyrics truncated. Full lyrics are too long to display.*',
                    });
                }
            } else {
                await interaction.editReply({
                    embeds: [{
                        color: 0x5865F2,
                        title: `🎵 ${searchQuery}`,
                        description: lyrics,
                        footer: {
                            text: 'Lyrics may not be 100% accurate',
                        },
                    }],
                });
            }
        } catch (error) {
            await logCommandError(interaction, error, 'lyrics');
            await interaction.editReply({
                content: 'Failed to fetch lyrics. Please try again later.',
            });
        }
    },
};
