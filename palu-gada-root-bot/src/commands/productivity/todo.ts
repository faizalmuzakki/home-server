import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

export const todoCommand: Command = {
    name: "todo",
    description: "Manage your personal todo list",
    usage: "/todo <add/list/done/delete> [args]",
    category: "Productivity",
    aliases: ["t"],
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const subcommand = args[0]?.toLowerCase();
        const userId = event.userId;

        if (!subcommand) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /todo <add/list/done/delete> [args]",
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
                const stmt = db.prepare("SELECT * FROM todos WHERE user_id = ? AND completed = 0 ORDER BY created_at ASC");
                const todos = stmt.all(userId) as any[];

                if (todos.length === 0) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "You have no pending todos!",
                    });
                    return;
                }

                const todoList = todos.map((t, i) => `${t.id}. ${t.task}`).join("\n");
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `**Your Todos:**\n${todoList}`,
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

            } else if (subcommand === "delete") {
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
            } else {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Unknown subcommand. Use add, list, done, or delete.",
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
