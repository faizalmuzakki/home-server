import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const RESPONSES = [
    { text: 'It is certain.', type: 'positive' },
    { text: 'It is decidedly so.', type: 'positive' },
    { text: 'Without a doubt.', type: 'positive' },
    { text: 'Yes, definitely.', type: 'positive' },
    { text: 'You may rely on it.', type: 'positive' },
    { text: 'As I see it, yes.', type: 'positive' },
    { text: 'Most likely.', type: 'positive' },
    { text: 'Outlook good.', type: 'positive' },
    { text: 'Yes.', type: 'positive' },
    { text: 'Signs point to yes.', type: 'positive' },
    { text: 'Reply hazy, try again.', type: 'neutral' },
    { text: 'Ask again later.', type: 'neutral' },
    { text: 'Better not tell you now.', type: 'neutral' },
    { text: 'Cannot predict now.', type: 'neutral' },
    { text: 'Concentrate and ask again.', type: 'neutral' },
    { text: "Don't count on it.", type: 'negative' },
    { text: 'My reply is no.', type: 'negative' },
    { text: 'My sources say no.', type: 'negative' },
    { text: 'Outlook not so good.', type: 'negative' },
    { text: 'Very doubtful.', type: 'negative' },
];

export const eightBallCommand: Command = {
    name: "8ball",
    description: "Ask the magic 8-ball a question",
    usage: "/8ball <question>",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const question = args.join(" ");

        if (!question) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /8ball <question>",
            });
            return;
        }

        const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `🎱 **Question:** ${question}\n✨ **Answer:** ${response.text}`,
        });
    }
};
