import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import {
    createPlaylist,
    getUserPlaylists,
    getPlaylist,
    getPlaylistById,
    updatePlaylistTracks,
    deletePlaylist,
} from '../database/models.js';
import { getQueue } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Manage your personal playlists')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new playlist')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Playlist name')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all your playlists')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View tracks in a playlist')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Playlist name')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add the current song to a playlist')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Playlist name')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a track from a playlist')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Playlist name')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('position')
                        .setDescription('Track position to remove (1-based)')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a playlist')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Playlist name')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('save')
                .setDescription('Save the current queue as a playlist')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Playlist name')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subcommand === 'create') {
            const name = interaction.options.getString('name');

            // Check if playlist already exists
            const existing = getPlaylist(userId, name);
            if (existing) {
                return interaction.reply({
                    content: `A playlist named **${name}** already exists.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            try {
                createPlaylist(userId, name, []);

                await interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '📝 Playlist Created',
                        description: `Created playlist **${name}**\n\nUse \`/playlist add ${name}\` to add songs!`,
                    }],
                });
            } catch (error) {
                await logCommandError(interaction, error, 'playlist');
                await interaction.reply({
                    content: 'Failed to create playlist.',
                    flags: MessageFlags.Ephemeral,
                });
            }

        } else if (subcommand === 'list') {
            const playlists = getUserPlaylists(userId);

            if (playlists.length === 0) {
                return interaction.reply({
                    content: 'You don\'t have any playlists yet. Use `/playlist create` to create one!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = {
                color: 0x5865F2,
                title: '🎵 Your Playlists',
                description: playlists.map((p, i) => {
                    const trackCount = p.tracks.length;
                    return `**${i + 1}.** ${p.name} - ${trackCount} track${trackCount !== 1 ? 's' : ''}`;
                }).join('\n'),
                footer: {
                    text: `${playlists.length} playlist${playlists.length !== 1 ? 's' : ''}`,
                },
            };

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'view') {
            const name = interaction.options.getString('name');
            const playlist = getPlaylist(userId, name);

            if (!playlist) {
                return interaction.reply({
                    content: `Playlist **${name}** not found.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (playlist.tracks.length === 0) {
                return interaction.reply({
                    embeds: [{
                        color: 0x5865F2,
                        title: `🎵 ${playlist.name}`,
                        description: '*No tracks yet*\n\nUse `/playlist add` to add songs!',
                    }],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const trackList = playlist.tracks.slice(0, 20).map((t, i) =>
                `**${i + 1}.** ${t.title} (${formatDuration(t.duration)})`
            ).join('\n');

            const embed = {
                color: 0x5865F2,
                title: `🎵 ${playlist.name}`,
                description: trackList,
                footer: {
                    text: playlist.tracks.length > 20
                        ? `Showing 20 of ${playlist.tracks.length} tracks`
                        : `${playlist.tracks.length} track${playlist.tracks.length !== 1 ? 's' : ''}`,
                },
            };

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'add') {
            const name = interaction.options.getString('name');
            const playlist = getPlaylist(userId, name);

            if (!playlist) {
                return interaction.reply({
                    content: `Playlist **${name}** not found.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const queue = getQueue(interaction.guildId);
            if (!queue || queue.songs.length === 0) {
                return interaction.reply({
                    content: 'No song is currently playing to add.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const currentSong = queue.songs[0];

            // Check for duplicates
            const isDuplicate = playlist.tracks.some(t => t.url === currentSong.url);
            if (isDuplicate) {
                return interaction.reply({
                    content: `**${currentSong.title}** is already in the playlist.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            playlist.tracks.push({
                title: currentSong.title,
                url: currentSong.url,
                duration: currentSong.duration,
            });

            updatePlaylistTracks(playlist.id, userId, playlist.tracks);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    description: `✅ Added **${currentSong.title}** to **${name}**`,
                }],
            });

        } else if (subcommand === 'remove') {
            const name = interaction.options.getString('name');
            const position = interaction.options.getInteger('position');
            const playlist = getPlaylist(userId, name);

            if (!playlist) {
                return interaction.reply({
                    content: `Playlist **${name}** not found.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (position > playlist.tracks.length) {
                return interaction.reply({
                    content: `Invalid position. Playlist has ${playlist.tracks.length} track${playlist.tracks.length !== 1 ? 's' : ''}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const removed = playlist.tracks.splice(position - 1, 1)[0];
            updatePlaylistTracks(playlist.id, userId, playlist.tracks);

            await interaction.reply({
                embeds: [{
                    color: 0xFEE75C,
                    description: `🗑️ Removed **${removed.title}** from **${name}**`,
                }],
            });

        } else if (subcommand === 'delete') {
            const name = interaction.options.getString('name');
            const playlist = getPlaylist(userId, name);

            if (!playlist) {
                return interaction.reply({
                    content: `Playlist **${name}** not found.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            deletePlaylist(playlist.id, userId);

            await interaction.reply({
                embeds: [{
                    color: 0xED4245,
                    description: `🗑️ Deleted playlist **${name}**`,
                }],
            });

        } else if (subcommand === 'save') {
            const name = interaction.options.getString('name');

            // Check if playlist already exists
            const existing = getPlaylist(userId, name);
            if (existing) {
                return interaction.reply({
                    content: `A playlist named **${name}** already exists.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const queue = getQueue(interaction.guildId);
            if (!queue || queue.songs.length === 0) {
                return interaction.reply({
                    content: 'The queue is empty. Nothing to save.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const tracks = queue.songs.map(s => ({
                title: s.title,
                url: s.url,
                duration: s.duration,
            }));

            createPlaylist(userId, name, tracks);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '💾 Queue Saved',
                    description: `Saved ${tracks.length} track${tracks.length !== 1 ? 's' : ''} to playlist **${name}**`,
                }],
            });
        }
    },
};

function formatDuration(seconds) {
    if (!seconds) return '?:??';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
