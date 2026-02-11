import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { addTodo, getUserTodos, toggleTodo, deleteTodo, clearCompletedTodos } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('todo')
        .setDescription('Manage your personal todo list')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new task')
                .addStringOption(option =>
                    option
                        .setName('task')
                        .setDescription('The task to add')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View your todo list')
                .addBooleanOption(option =>
                    option
                        .setName('show_completed')
                        .setDescription('Show completed tasks')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('done')
                .setDescription('Mark a task as completed')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The task ID to mark as done')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('undone')
                .setDescription('Mark a task as not completed')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The task ID to mark as not done')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a task')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The task ID to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all completed tasks')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subcommand === 'add') {
            const task = interaction.options.getString('task');

            try {
                const result = addTodo(userId, task);

                await interaction.reply({
                    content: `✅ Task added! (ID: ${result.lastInsertRowid})\n📝 ${task}`,
                    flags: MessageFlags.Ephemeral,
                });
            } catch (error) {
                await logCommandError(interaction, error, 'todo');
                await interaction.reply({
                    content: 'Failed to add task. Please try again.',
                    flags: MessageFlags.Ephemeral,
                });
            }

        } else if (subcommand === 'list') {
            const showCompleted = interaction.options.getBoolean('show_completed') || false;
            const todos = getUserTodos(userId);

            const filteredTodos = showCompleted
                ? todos
                : todos.filter(t => !t.completed);

            if (filteredTodos.length === 0) {
                return interaction.reply({
                    content: showCompleted
                        ? 'Your todo list is empty.'
                        : 'No pending tasks! Use `/todo add` to add a new task.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const pendingCount = todos.filter(t => !t.completed).length;
            const completedCount = todos.filter(t => t.completed).length;

            const embed = {
                color: 0x5865F2,
                title: '📋 Your Todo List',
                description: filteredTodos.slice(0, 15).map(t => {
                    const checkbox = t.completed ? '✅' : '⬜';
                    const text = t.completed ? `~~${t.task}~~` : t.task;
                    return `${checkbox} **#${t.id}** - ${text.slice(0, 100)}`;
                }).join('\n'),
                footer: {
                    text: `${pendingCount} pending, ${completedCount} completed${filteredTodos.length > 15 ? ` (showing 15 of ${filteredTodos.length})` : ''}`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        } else if (subcommand === 'done') {
            const taskId = interaction.options.getInteger('id');

            const result = toggleTodo(taskId, userId, true);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Task not found or it doesn\'t belong to you.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `✅ Task #${taskId} marked as done!`,
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === 'undone') {
            const taskId = interaction.options.getInteger('id');

            const result = toggleTodo(taskId, userId, false);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Task not found or it doesn\'t belong to you.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `⬜ Task #${taskId} marked as not done.`,
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === 'remove') {
            const taskId = interaction.options.getInteger('id');

            const result = deleteTodo(taskId, userId);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Task not found or it doesn\'t belong to you.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `🗑️ Task #${taskId} removed.`,
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === 'clear') {
            const result = clearCompletedTodos(userId);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'No completed tasks to clear.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `🗑️ Cleared ${result.changes} completed task${result.changes !== 1 ? 's' : ''}.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
