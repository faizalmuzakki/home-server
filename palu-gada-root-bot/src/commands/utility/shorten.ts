import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const shortenCommand: Command = {
    name: "shorten",
    description: "Shorten a URL",
    usage: "/shorten <url>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const url = args.join(" ").trim();

        if (!url) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/shorten <url>`",
            });
            return;
        }

        try {
            new URL(url);
        } catch {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Please provide a valid URL.",
            });
            return;
        }

        try {
            const response = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
            const data = await response.json() as any;
            if (!response.ok || data.errorcode) {
                throw new Error(data.errormessage || "URL shortening failed");
            }

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**Short URL**\n${data.shorturl}\nOriginal: ${url}`,
            });
        } catch (error) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to shorten that URL.",
            });
        }
    }
};
