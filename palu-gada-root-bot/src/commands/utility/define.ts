import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const defineCommand: Command = {
    name: "define",
    description: "Get the definition of a word",
    usage: "/define <word>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const word = args[0]?.toLowerCase().trim();

        if (!word) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /define <word>",
            });
            return;
        }

        try {
            const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
            if (!response.ok) {
                if (response.status === 404) {
                    await rootServer.community.channelMessages.create({
                        channelId: event.channelId,
                        content: `No definition found for **${word}**.`,
                    });
                    return;
                }
                throw new Error('API error');
            }

            const data = await response.json() as any;
            const entry = data[0];

            let content = `📖 **${entry.word}**\n`;
            if (entry.phonetic) content += `*${entry.phonetic}*\n`;

            for (const meaning of entry.meanings.slice(0, 2)) {
                content += `\n**${meaning.partOfSpeech}**\n`;
                for (const def of meaning.definitions.slice(0, 2)) {
                    content += `• ${def.definition}\n`;
                    if (def.example) content += `  *"${def.example}"*\n`;
                }
            }

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: content.slice(0, 2000),
            });
        } catch (error) {
            console.error("Define error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch definition. Try again later.",
            });
        }
    }
};
