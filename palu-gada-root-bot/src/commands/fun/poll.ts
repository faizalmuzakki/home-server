import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

export const pollCommand: Command = {
    name: "poll",
    description: "Create a poll",
    usage: "/poll <question> | [option1] | [option2] | ...",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;

        if (args.length === 0) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/poll <question>` for a Yes/No poll\nOr: `/poll <question> | option1 | option2 | ...` for multiple choice (up to 10 options)",
            });
            return;
        }

        // Reconstruct full text from args, split on |
        const fullText = args.join(" ");
        const parts = fullText.split("|").map(p => p.trim()).filter(p => p.length > 0);

        const question = parts[0];
        const options = parts.slice(1);

        if (!question) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Please provide a poll question.",
            });
            return;
        }

        if (options.length === 1) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "You need at least 2 options (or none for a Yes/No poll).",
            });
            return;
        }

        if (options.length > 10) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Maximum 10 options allowed.",
            });
            return;
        }

        const isYesNo = options.length === 0;

        let content: string;

        if (isYesNo) {
            content = `📊 **Poll by <@${event.userId}>**\n\n**${question}**\n\n👍 Yes  ·  👎 No\n\n_React to vote!_`;
        } else {
            const optionLines = options.map((opt, i) => `${NUMBER_EMOJIS[i]} ${opt}`).join("\n");
            content = `📊 **Poll by <@${event.userId}>**\n\n**${question}**\n\n${optionLines}\n\n_React to vote!_`;
        }

        const msg = await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content,
        });

        // Add reaction prompts
        const reactions = isYesNo ? ["👍", "👎"] : options.map((_, i) => NUMBER_EMOJIS[i]);
        for (const emoji of reactions) {
            try {
                await rootServer.community.channelMessages.reactionCreate({
                    channelId: event.channelId,
                    messageId: msg.id,
                    shortcode: emoji,
                });
            } catch {
                // Ignore — reaction may not be supported
            }
        }
    }
};
