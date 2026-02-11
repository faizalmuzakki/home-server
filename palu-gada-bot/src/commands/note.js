import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { addNote, getUserNotes, getNote, updateNote, deleteNote } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('note')
        .setDescription('Manage your personal notes')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Create a new note')
                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('Note title')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('content')
                        .setDescription('Note content')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all your notes')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View a specific note')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The note ID to view')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit an existing note')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The note ID to edit')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('New title (leave empty to keep current)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('content')
                        .setDescription('New content (leave empty to keep current)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a note')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The note ID to delete')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subcommand === 'add') {
            const title = interaction.options.getString('title');
            const content = interaction.options.getString('content');

            try {
                const result = addNote(userId, title, content);

                const embed = {
                    color: 0x57F287,
                    title: '📝 Note Created',
                    fields: [
                        {
                            name: `#${result.lastInsertRowid} - ${title}`,
                            value: content.slice(0, 1024),
                        },
                    ],
                    footer: {
                        text: 'Use /note view to see the full note',
                    },
                    timestamp: new Date().toISOString(),
                };

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } catch (error) {
                await logCommandError(interaction, error, 'note');
                await interaction.reply({
                    content: 'Failed to create note. Please try again.',
                    flags: MessageFlags.Ephemeral,
                });
            }

        } else if (subcommand === 'list') {
            const notes = getUserNotes(userId);

            if (notes.length === 0) {
                return interaction.reply({
                    content: 'You don\'t have any notes yet. Use `/note add` to create one!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = {
                color: 0x5865F2,
                title: '📒 Your Notes',
                description: notes.slice(0, 15).map(n => {
                    const preview = n.content.slice(0, 50) + (n.content.length > 50 ? '...' : '');
                    const date = new Date(n.updated_at).toLocaleDateString();
                    return `**#${n.id}** - ${n.title}\n└ *${preview}* (${date})`;
                }).join('\n\n'),
                footer: {
                    text: notes.length > 15
                        ? `Showing 15 of ${notes.length} notes`
                        : `${notes.length} note${notes.length !== 1 ? 's' : ''} total`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'view') {
            const noteId = interaction.options.getInteger('id');
            const note = getNote(noteId, userId);

            if (!note) {
                return interaction.reply({
                    content: 'Note not found or it doesn\'t belong to you.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const createdAt = new Date(note.created_at);
            const updatedAt = new Date(note.updated_at);

            const embed = {
                color: 0x5865F2,
                title: `📝 ${note.title}`,
                description: note.content.slice(0, 4096),
                fields: [
                    {
                        name: 'Created',
                        value: `<t:${Math.floor(createdAt.getTime() / 1000)}:R>`,
                        inline: true,
                    },
                    {
                        name: 'Last Updated',
                        value: `<t:${Math.floor(updatedAt.getTime() / 1000)}:R>`,
                        inline: true,
                    },
                ],
                footer: {
                    text: `Note ID: ${note.id}`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'edit') {
            const noteId = interaction.options.getInteger('id');
            const newTitle = interaction.options.getString('title');
            const newContent = interaction.options.getString('content');

            if (!newTitle && !newContent) {
                return interaction.reply({
                    content: 'Please provide a new title or content to update.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Get existing note
            const existingNote = getNote(noteId, userId);
            if (!existingNote) {
                return interaction.reply({
                    content: 'Note not found or it doesn\'t belong to you.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const result = updateNote(
                noteId,
                userId,
                newTitle || existingNote.title,
                newContent || existingNote.content
            );

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Failed to update note.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `✅ Note #${noteId} has been updated.`,
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === 'delete') {
            const noteId = interaction.options.getInteger('id');

            const result = deleteNote(noteId, userId);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Note not found or it doesn\'t belong to you.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `🗑️ Note #${noteId} has been deleted.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
