import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const SUBREDDITS = ['memes', 'dankmemes', 'me_irl', 'wholesomememes', 'ProgrammerHumor'];

export const memeCommand: Command = {
    name: "meme",
    description: "Get a random meme from Reddit",
    usage: "/meme [subreddit]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        let subreddit = args[0]?.toLowerCase() || 'random';

        if (subreddit === 'random') {
            subreddit = SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
        }

        try {
            const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=100`);
            if (!response.ok) throw new Error('Failed to fetch from Reddit');

            const data = await response.json() as any;
            const posts = data.data.children.filter((post: any) => {
                const p = post.data;
                return (
                    !p.over_18 &&
                    !p.stickied &&
                    !p.is_video &&
                    (p.url.endsWith('.jpg') ||
                     p.url.endsWith('.jpeg') ||
                     p.url.endsWith('.png') ||
                     p.url.endsWith('.gif') ||
                     p.url.includes('i.redd.it') ||
                     p.url.includes('i.imgur.com'))
                );
            });

            if (posts.length === 0) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: 'No memes found! Try a different subreddit.',
                });
                return;
            }

            const post = posts[Math.floor(Math.random() * posts.length)].data;
            let imageUrl = post.url;

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `🖼️ **${post.title}** (r/${subreddit})\n${imageUrl}`,
            });
        } catch (error) {
            console.error("Meme error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch meme. Try again later.",
            });
        }
    }
};
