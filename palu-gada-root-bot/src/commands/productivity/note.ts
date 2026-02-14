import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

export const noteCommand: Command = {
    name: "note",
    description: "Manage your personal notes",
    usage: "/note <add/list/view/delete> [args]",
    category: "Productivity",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const subcommand = args[0]?.toLowerCase();
        const userId = event.userId;

        if (!subcommand) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /note <add/list/view/delete> [args]\nExample: /note add My Title | My content",
            });
            return;
        }

        try {
            if (subcommand === "add") {
                const fullText = args.slice(1).join(" ");
                const parts = fullText.split("|").map(p => p.trim());
                const title = parts[0];
                const content = parts[1];

                if (!title || !content) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "Please provide title and content separated by '|'.\nExample: /note add My Title | My content",
                    });
                    return;
                }

                db.prepare("INSERT INTO notes (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
                    .run(userId, title, content, Date.now(), Date.now());

                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `✅ Note created: **${title}**`,
                });

            } else if (subcommand === "list") {
                const notes = db.prepare("SELECT id, title FROM notes WHERE user_id = ?").all(userId) as any[];
                if (notes.length === 0) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "You have no notes.",
                    });
                    return;
                }

                const list = notes.map(n => `#${n.id} - ${n.title}`).join("\n");
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `📒 **Your Notes:**\n${list}`,
                });

            } else if (subcommand === "view") {
                const id = parseInt(args[1]);
                const note = db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(id, userId) as any;
                if (!note) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "Note not found.",
                    });
                    return;
                }

                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `📝 **${note.title}**\n\n${note.content}`,
                });

            } else if (subcommand === "delete") {
                const id = parseInt(args[1]);
                const result = db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(id, userId);
                if (result.changes > 0) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: `🗑️ Deleted note #${id}.`,
                    });
                } else {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: "Note not found.",
                    });
                }
            }
        } catch (error) {
            console.error("Note error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "An error occurred with notes.",
            });
        }
    }
};
