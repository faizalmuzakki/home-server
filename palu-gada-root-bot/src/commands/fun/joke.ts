import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const JOKE_APIS: Record<string, string> = {
    programming: 'https://v2.jokeapi.dev/joke/Programming?safe-mode',
    misc: 'https://v2.jokeapi.dev/joke/Miscellaneous?safe-mode',
    pun: 'https://v2.jokeapi.dev/joke/Pun?safe-mode',
    dark: 'https://v2.jokeapi.dev/joke/Dark?safe-mode',
    any: 'https://v2.jokeapi.dev/joke/Any?safe-mode',
};

export const jokeCommand: Command = {
    name: "joke",
    description: "Get a random joke",
    usage: "/joke [category]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const category = args[0]?.toLowerCase() || 'any';
        const url = JOKE_APIS[category] || JOKE_APIS.any;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch joke');
            const joke = await response.json() as any;

            let content = "";
            if (joke.type === 'single') {
                content = `😂 **Joke:**\n${joke.joke}`;
            } else {
                content = `😂 **Joke:**\n${joke.setup}\n\n||${joke.delivery}||`;
            }

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: content,
            });
        } catch (error) {
            console.error("Joke error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch a joke. Try again later.",
            });
        }
    }
};
