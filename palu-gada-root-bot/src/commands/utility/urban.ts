import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const urbanCommand: Command = {
    name: "urban",
    description: "Look up a word on Urban Dictionary",
    usage: "/urban <term>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const term = args.join(" ");

        if (!term) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /urban <term>",
            });
            return;
        }

        try {
            const response = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
            if (!response.ok) throw new Error('Failed to fetch from Urban Dictionary');

            const data = await response.json() as any;
            if (!data.list || data.list.length === 0) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `No definitions found for **${term}**`,
                });
                return;
            }

            const definition = data.list[0];
            const cleanDef = definition.definition.replace(/[\[\]]/g, '').slice(0, 500);
            const cleanExample = definition.example ? definition.example.replace(/[\[\]]/g, '').slice(0, 500) : 'No example provided';

            const content = `📖 **${definition.word}**\n\n${cleanDef}\n\n**Example:**\n*${cleanExample}*\n\n👍 ${definition.thumbs_up} | 👎 ${definition.thumbs_down}`;

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: content,
            });
        } catch (error) {
            console.error("Urban error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch from Urban Dictionary.",
            });
        }
    }
};
