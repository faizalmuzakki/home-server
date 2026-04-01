import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

export const todoCommand: Command = {
    name: "todo",
    description: "Manage your personal todo list",
    usage: "/todo <add/list/done/undone/remove/delete/clear> [args]",
    category: "Productivity",
    aliases: ["t"],
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const subcommand = args[0]?.toLowerCase();
        const userId = event.userId;

        if (!subcommand) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /todo <add/list/done/undone/remove/delete/clear> [args]",
            });
            return;
        }

        try {
            if (subcommand === "add") {
                const task = args.slice(1).join(" ");
                if (!task) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "Please provide a task description.",
                    });
                    return;
                }

                const stmt = db.prepare("INSERT INTO todos (user_id, task, created_at) VALUES (?, ?, ?)");
                stmt.run(userId, task, Date.now());

                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `✅ Added todo: ${task}`,
                });

            } else if (subcommand === "list") {
                const showCompleted = args[1]?.toLowerCase() === "all" || args[1]?.toLowerCase() === "completed";
                const stmt = db.prepare("SELECT * FROM todos WHERE user_id = ? ORDER BY completed ASC, created_at ASC");
                const allTodos = stmt.all(userId) as Array<{ id: number; task: string; completed: number }>;
                const todos = showCompleted ? allTodos : allTodos.filter(todo => todo.completed === 0);

                if (todos.length === 0) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: showCompleted ? "Your todo list is empty." : "You have no pending todos!",
                    });
                    return;
                }

                const pendingCount = allTodos.filter(todo => todo.completed === 0).length;
                const completedCount = allTodos.filter(todo => todo.completed === 1).length;
                const todoList = todos
                    .slice(0, 20)
                    .map(todo => `${todo.completed ? "✅" : "⬜"} ${todo.id}. ${todo.completed ? `~~${todo.task}~~` : todo.task}`)
                    .join("\n");
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `**Your Todos**\n${todoList}\n\nPending: ${pendingCount} | Completed: ${completedCount}${todos.length > 20 ? "\nShowing first 20 items." : ""}`,
                });

            } else if (subcommand === "done" || subcommand === "complete") {
                const id = parseInt(args[1]);
                if (isNaN(id)) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "Please provide a valid todo ID.",
                    });
                    return;
                }

                const stmt = db.prepare("UPDATE todos SET completed = 1 WHERE id = ? AND user_id = ?");
                const result = stmt.run(id, userId);

                if (result.changes > 0) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: `✅ Marked todo #${id} as complete!`,
                    });
                } else {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: `Todo #${id} not found or already completed.`,
                    });
                }

            } else if (subcommand === "undone") {
                const id = parseInt(args[1], 10);
                if (Number.isNaN(id)) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "Please provide a valid todo ID.",
                    });
                    return;
                }

                const stmt = db.prepare("UPDATE todos SET completed = 0 WHERE id = ? AND user_id = ?");
                const result = stmt.run(id, userId);

                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: result.changes > 0
                        ? `⬜ Marked todo #${id} as not done.`
                        : `Todo #${id} not found.`,
                });

            } else if (subcommand === "delete" || subcommand === "remove") {
                const id = parseInt(args[1]);
                if (isNaN(id)) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "Please provide a valid todo ID.",
                    });
                    return;
                }

                const stmt = db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?");
                const result = stmt.run(id, userId);

                if (result.changes > 0) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: `🗑️ Deleted todo #${id}.`,
                    });
                } else {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: `Todo #${id} not found.`,
                    });
                }
            } else if (subcommand === "clear") {
                const stmt = db.prepare("DELETE FROM todos WHERE user_id = ? AND completed = 1");
                const result = stmt.run(userId);

                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: result.changes > 0
                        ? `🗑️ Cleared ${result.changes} completed task${result.changes !== 1 ? "s" : ""}.`
                        : "No completed tasks to clear.",
                });
            } else {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Unknown subcommand. Use add, list, done, undone, remove, delete, or clear.",
                });
            }
        } catch (error) {
            console.error("Todo command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "An error occurred while processing your request.",
            });
        }
    }
};
